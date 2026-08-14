# Inventario verificado de hallazgos — auditoría UI de Vina

Producto de 7 lentes de censo + 7 verificadores adversariales (14 agentes, 699 llamadas a herramientas, 1,7M tokens).
Cada verificador tenía la instrucción de **refutar**: abrir el archivo:línea citado y tumbar el hallazgo si no se sostenía.

**Confirmados: 67 · Refutados: 18**

---

## [ALTO] 9 tokens se consumen pero no existen: BottomPanel pintado contra un design system fantasma (69% de sus var() caen al fallback)

- src/components/BottomPanel/BOMTab.css:19 `border-bottom: 1px solid var(--border-color, #333);` — leído, exacto
- src/components/BottomPanel/BOMTab.css:25-26 `background: var(--button-bg, #2a2a2a);` / `color: var(--text-color, #ccc);` — exacto
- src/components/BottomPanel/BOMTab.css:87 `color: var(--accent-color, #3b82f6);` — exacto
- src/components/BottomPanel/NestingTab.css:34 `background: var(--button-hover-bg, #3a3a3a);` — exacto
- src/components/Viewport3D/AvatarPanel.css:162 `background: var(--bg-hover, #333);` — exacto
- src/components/LayerPanel/LayerPanel.css:3 `border-bottom: 1px solid var(--panel-border, #2a2a3e);` — exacto
- src/copilot/connections/DynamicProviderForm.tsx:141 `style={{ color: 'var(--text-accent, var(--accent, #6366f1))' }}` — exacto
- Recuento propio (comm entre definidos y referenciados): 75 definidos, 80 referenciados, diff = exactamente los 9 nombrados. Ninguno aparece en src/, index.html, ni vía setProperty() en runtime — grep de setProperty('--...') devuelve vacío
- Blast radius recontado por mí con grep por archivo: BOMTab.css 20/29, GradingTab.css 13/21, NestingTab.css 13/17 → 46/67 = 68.7%. La cifra del auditor es correcta
- Los tres tabs son código vivo: src/components/shell/AppShell.tsx:26 los carga con lazy(); BOMTab.tsx:31 importa su CSS

> **Nota del verificador:** Hechos confirmados uno por uno, pero BAJO la severidad de BLOQUEANTE a ALTO. El rubro dice BLOQUEANTE = rompe uso real, y aquí nada se rompe: el fallback resuelve y las pantallas se ven. El propio texto del auditor lo admite ('la pantalla se ve bien'). Es deriva sistémica pura, que es exactamente ALTO. Lo que sí sostengo entero es la consecuencia operativa: tocar tokens.css hoy no mueve estas tres pestañas.

## [ALTO] El mismo token se invoca con fallbacks que se contradicen: --accent con 3 valores, --text-primary con 5

- Recuento propio de `var(--accent, X)`: 8 con #007acc, 7 con #6366f1, 3 con #4a9eff. Coincide exacto con el auditor
- src/components/Viewport3D/AvatarPanel.css:122 `border-color: var(--accent, #007acc);` (y :123 repite el mismo fallback en color) — exacto
- src/components/PatternEditor/ReferenceImageSettings.css:18 `color: var(--accent, #4a9eff);` — exacto
- src/App.css:18-21 contiene literalmente el comentario 'NO redefinir aquí — este bloque carga después de tokens.css y lo pisaba (la app entera renderizaba el azul VS-Code legacy en vez del indigo del design system)' — exacto
- Recuento propio de --text-primary: #ccc x6, #e0e0e0 x5, #f0f0f0 x3, #fff x1, #ddd x1. Idéntico al reportado
- Recuento propio de --text-muted: #999 x14, #888 x8, #555 x1. Idéntico
- Recuento propio de --text-secondary: #999 x7, #ccc x3, #888 x1. Idéntico
- src/components/LayerPanel/LayerPanel.css:4 `var(--panel-section-bg, #2a2a3e)` vs :10 `var(--panel-section-bg, #1e1e3a)` — ambas líneas leídas, dos fallbacks distintos para el mismo token en el mismo archivo

> **Nota del verificador:** Los 5 conteos me dieron idénticos al dígito. Una precisión que el auditor no hace y cambia la lectura: como --accent SÍ está definido en :root (tokens.css:16), esos 8 #007acc NUNCA se pintan — son código muerto, no 'azul VS Code vivo en 8 sitios'. El daño es de mantenimiento (cápsula del tiempo que sobrevive a los grep de purga), no visual. La excepción real es LayerPanel:4 vs :10, donde --panel-section-bg sí es huérfano y ahí los dos fallbacks SÍ se pintan, con 6 líneas de distancia.

## [ALTO] Segundo :root en App.css con familia semántica duplicada: --color-* vs --destructive/--success/--warning

- src/App.css:13 `:root {` — verificado con grep -rn ':root' src/ --include=*.css: solo hay DOS en todo el repo, App.css:13 y tokens.css:1
- App.css:2-5 importa styles/ al tope, así que el bloque de App.css carga después — confirmado leyendo las líneas
- src/App.css:26 `--color-error: #ef4444;` vs src/styles/tokens.css:22 `--destructive: #ef4444;` — mismo valor, dos nombres. Ambas líneas leídas
- src/App.css:28 `--color-success: #10b981;` vs tokens.css:21 `--success: #22c55e;` — valores distintos. Exacto
- src/App.css:27 `--color-warning: #cca700;` vs tokens.css:23 `--warning: #f59e0b;` — valores distintos. Exacto
- src/App.css:22 `--accent-dim: rgba(99, 102, 241, 0.15); /* legacy alias de --accent-subtle; consumidor vivo: InputSchemeSection */` vs tokens.css:18 `--accent-subtle: rgba(99, 102, 241, 0.13);` — el alias declarado difiere en alfa. Exacto
- Ambos vocabularios están vivos: --success/--destructive/--warning se consumen en base.css, PropertiesPanel.css, floating.css, NotchPrecisionModal.css; --color-success en AvatarPanel.css:284, --color-error en UnifiedBarChat.tsx:303 y :342 y ConnectionCard.tsx:177, --color-warning en ConnectionCard.tsx:160
- src/copilot/connections/ConnectionCard.tsx:160 `background: 'var(--color-warning, #ca8a04)'` — exacto
- src/components/shell/UnifiedBarChat.tsx:303 `color: tc.status === 'error' ? 'var(--color-error, #f87171)' : 'var(--text-ghost)'` — exacto

> **Nota del verificador:** El núcleo (dos vocabularios semánticos vivos con valores discrepantes) queda confirmado. Pero la última viñeta del auditor está AL REVÉS y la desmonto abajo en refutados: como --color-error/--color-warning/--panel-bg SÍ están definidos en App.css:13, la definición gana siempre y el fallback es inalcanzable. No hay 'tercer amarillo' pintándose. Además --panel-bg se consume con fallback #1e1e1e, que es su MISMO valor, no otro. La deriva real es la duplicación de familia, no un conflicto de render.

## [MEDIO] No existe escala de elevación/velo: 45 pasos de opacidad inventados a mano

- Recuento propio de blancos: 21 alfas distintas (0.04 0.06 0.07 0.08 0.1 0.12 0.14 0.15 0.16 0.2 0.28 0.3 0.4 0.45 0.5 0.6 0.7 0.75 0.8 0.85 0.9). Idéntico a lo reportado
- Recuento propio de negros: 15 alfas distintas (0.2 0.22 0.3 0.35 0.4 0.45 0.5 0.6 0.65 0.7 0.72 0.75 0.8 0.88 0.9). Idéntico
- Recuento propio del indigo rgba(99,102,241,·): 9 alfas con estos conteos exactos — 0.08 x6, 0.1 x7, 0.12 x1, 0.13 x1, 0.14 x1, 0.15 x8, 0.2 x2, 0.27 x1, 0.3 x1. Idéntico al dígito
- 28 apariciones totales del indigo literal menos las 2 definiciones de tokens.css = 26 sitios que re-derivan su propia alfa a mano. La cifra 26 del auditor es correcta
- src/styles/tokens.css:94-97 bloque 'Effects' leído completo: solo --blur, --transition-fast, --transition-normal. Grep de shadow/overlay/scrim/elevation en tokens.css: cero definiciones (la única línea que hace match es un comentario sobre SeamRenderer)
- src/styles/floating.css:25 `rgba(8, 8, 15, 0.95)` y :90, :164, :187 `rgba(8, 8, 15, 0.92)` — cuatro líneas verificadas, dos alfas para el mismo vidrio, sin token

> **Nota del verificador:** Bajo de ALTO a MEDIO porque el 'dato más duro' del hallazgo es falso (ver refutados): --accent-subtle tiene 9 consumidores vía var() y --accent-border 5, no cero. El auditor confundió 'cero consumo del literal rgba' con 'cero consumidores'. Lo que queda en pie, y es real, es que el sistema no ofrece familia de velo/elevación y por eso 45 alfas distintas viven a mano, con pares indistinguibles a ojo (0.08 y 0.1 con 6 y 7 usos).

## [MEDIO] No hay mecanismo de tema y sí hay dos suelos: cromo oscuro hardcodeado flotando sobre el lienzo crema

- Grep de prefers-color-scheme|data-theme|color-scheme|[theme sobre src/ e index.html: resultado vacío. Confirmado
- src/styles/tokens.css:29 `--canvas-2d: #f1efe8;` y el comentario de :25-28 'Namespaced so the dark app chrome (--accent above) is untouched' — leído, exacto
- El suelo crema es real en render: GridLayer.tsx:48 pinta `<rect width="100%" height="100%" style={{ fill: 'var(--canvas-2d)' }} />` y RulerLayer.tsx:35 lo reusa
- src/components/shell/ToolTooltip.css:7-9 `z-index: 10000; background: #1a1a1a; border: 1px solid #3a3a3a;` — tres líneas exactas
- src/components/shell/Dock.tsx:42 `<ToolTooltip key={tool.id} ...>` — exacto
- src/components/PatternEditor/FloatingActionBar.tsx:86 `<ToolTooltip key={def.id} ...>` — exacto; el FAB se monta en PatternEditor.tsx:1033, o sea sobre el lienzo crema
- src/components/PatternEditor/FloatingActionBar.tsx:76 `backgroundColor: '#1a1a1a',` y :77 `border: '1px solid #333',` y :102 `color: '#e0e0e0',` — las tres verificadas
- src/components/PatternEditor/EmptyState2D.css:29 `color: var(--ink-on-light);` y :52 `border-color: var(--accent-2d);` — el contenido del lienzo sí usa el vocabulario claro

> **Nota del verificador:** Todas las citas existen y dicen lo afirmado; la línea del ink-on-light es :29, no :31 (desfase de dos, el resto exacto). Bajo a MEDIO y le quito una capa a la tesis: cromo flotante OSCURO sobre lienzo claro no es un defecto, es la convención de todo CAD/editor de diseño (tooltip oscuro sobre documento claro maximiza contraste y separa capa de herramienta de capa de documento). Lo que sí es deriva verificable es otra cosa: ese cromo está escrito con literales (#1a1a1a, #3a3a3a, #333, #e0e0e0) que ni siquiera son el azul-negro del sistema, así que no responde a ningún token. La recomendación de crear un tema claro para el cromo flotante NO la respaldo; la de prohibir literales en superficies flotantes, sí.

## [ALTO] Tres familias de gris con casi-duplicados de idéntico R,G: #2a2a2a / #2a2a3e / #2a2a42 / #2a2a4a

- src/App.css:14-16 `--bg-primary: #1a1a1a; --bg-secondary: #242424; --panel-bg: #1e1e1e;` — exacto
- src/styles/tokens.css:3-9 `--bg-base: #0c0c14; --bg-deeper: #08080f; --bg-surface: #10101c; --bg-elevated: #1a1a2e;` y `--border: #2a2a42;` en :9 — exacto
- src/components/BottomPanel/InspectorTab.css:81 `border-top: 1px solid #2a2a4a;` — exacto
- src/components/BottomPanel/InspectorTab.css:105 `border: 1px solid #3a3a5a;` — exacto
- src/components/LayerPanel/LayerPanel.css:35 `.layer-context-menu { position: fixed; background: #1e1e2e; border: 1px solid #3a3a4e; ... }` — exacto
- src/components/LayerPanel/LayerPanel.css:31 `.layer-color-popover { position: absolute; background: #1e1e1e; border: 1px solid #3a3a3a; ... }` — exacto. La prueba de los dos popovers del mismo componente en dos familias distintas se sostiene leyendo cuatro líneas seguidas
- Cuarteto #2a2a2a (BOMTab.css:25) / #2a2a3e (LayerPanel.css:3) / #2a2a42 (tokens.css:9) / #2a2a4a (InspectorTab.css:81): las cuatro líneas verificadas, R y G idénticos en las cuatro
- Trío #1e1e1e (App.css:16) / #1e1e2e (LayerPanel.css:35) / #1e1e3a (LayerPanel.css:10): las tres verificadas
- src/components/shared/SubMenu.css:1-3 dice literalmente 'this used to be a flat VSCode-dark one-off (#1e1e1e) that clashed with every other floating surface' — exacto

> **Nota del verificador:** El más sólido del lote: cada valor citado lo leí en su línea, sin desfases. La firma R=G idéntico con solo el canal azul variando no admite lectura inocente. Y LayerPanel:31 vs :35 es el caso irrefutable — dos superficies flotantes del mismo componente, cuatro líneas de distancia, dos sistemas de gris. La regla propuesta ('R y G iguales y B a menos de 0x30 no pueden coexistir') es mecánicamente verificable, que es lo que la hace útil como test.

## [MEDIO] Los renderers 2D anulan el criterio de croma de tokens.css, y 'seleccionado' tiene dos idiomas sobre el mismo lienzo

- src/styles/tokens.css:43-45 contiene literalmente 'Status/marker hues muted for the cream paper ground (were vivid #ef4444 / #ff9800 / #9c27b0 / #3f51b5): chroma roughly halved ... not a parade.' — exacto
- src/components/PatternEditor/renderers/ConstructionOverlay.tsx:14-19 `point: '#ff6b35', pointSelected: '#ff3366', line: '#4ecdc4', curve: '#a855f7', label: '#ff6b35', pieceOutline: '#22d3ee',` — exacto, seis líneas
- Es código vivo sobre el lienzo: PatternEditor.tsx:855 `<ConstructionOverlay zoom2D={zoom2D} pieces={pieces} />`, sin gate de dev
- src/components/PatternEditor/renderers/ElasticRenderer.tsx:22-24 `band: '#3B82F6', shirring: '#8B5CF6', drawstring: '#10B981',` — exacto; montado en PatternEditor.tsx:872
- #9c27b0 recontado por mí: 14 usos en .tsx, concentrados en renderers/overlays/MeasureToolOverlay.tsx (:74, :77, :82, :99). La cifra 14 es correcta
- src/components/PatternEditor/renderers/PieceRenderer.tsx:114 `const cutStroke = isSelected ? 'var(--accent-2d)' : 'var(--ink-on-light)';` — exacto
- src/components/PatternEditor/renderers/internalLineStyle.ts:11 `if (isSelected) return 'var(--accent-2d)';` — exacto
- src/components/PatternEditor/renderers/pieceBodyStyle.ts:48 `: isSelected ? 'color-mix(in oklab, var(--accent-2d) 14%, var(--piece-fill-2d))'` — exacto
- src/components/PatternEditor/renderers/AnchorGlyph.tsx:15-17 `idle: '#4A9EFF', hovered: '#6BB3FF', selected: '#FFD700',` — exacto
- src/components/PatternEditor/renderers/overlays/EditPatternOverlay.tsx:61 `stroke={isSelected ? '#FFD700' : '#6BB3FF'}` — exacto

> **Nota del verificador:** Diez citas, diez exactas, incluidas las de líneas .ts que suelen ser donde un auditor inventa. Dos matices: (1) el comentario de tokens.css:43-45 habla de los marcadores de ESTADO de pieza, no decreta purga global de #9c27b0, así que el MeasureToolOverlay no viola una regla escrita — viola el criterio, que es más débil pero sigue siendo el punto; (2) el oro #FFD700 para 'seleccionado' podría defenderse como señal distinta (anclaje editable vs pieza seleccionada), pero entonces debería estar en tokens con ese significado, no como literal en dos archivos. La contradicción de idiomas se sostiene.

## [ALTO] No existe token ni escala de z-index: 15 valores a mano en un único contexto de apilamiento plano

- src/styles/tokens.css tiene EXACTAMENTE 67 declaraciones `--*` y el bloque `:root` cierra en la línea 98 con `--transition-normal`. `grep -- '--z' tokens.css` → 0 resultados. Confirmado: cero tokens de apilamiento.
- src/styles/tokens.css:90-91 — `--top-bar-h: clamp(36px, 2.5vw, 48px);` y `--unified-bar-h: clamp(44px, 3vw, 56px);`. Confirmado: el sistema SÍ tokeniza geometría de cromo.
- src/styles/floating.css:4 `z-index: 15`, :30 `z-index: 25`, :96 `z-index: 200`, :172 `z-index: 210`, :180 `z-index: 1000`. Los cinco literales verificados en las líneas exactas citadas.
- Recuento propio del censo de z-index: 28 declaraciones en .css + 15 `zIndex` reales en .tsx (descontando las 11 ocurrencias de la VARIABLE `zIndex` en nodeEditorUtils.ts / EditPatternOverlay.tsx / mergeOutline.ts, que son índices del comando 'Z' de un path SVG, no capas) = 43 declaraciones. Valores distintos: 15 en CSS (coincide con el censo del brief) y 17 contando JSX (suma 90 y 50).
- `grep -rn 'isolation|contain:|will-change' src/` → 5 resultados, los 5 la palabra 'isolation' en comentarios de .ts (store/index.ts:105, projectAutosave.ts:14, buildAxisHints.ts:31, gpuSolverClient.test.ts:483, tslCollision.test.ts:407). Cero en CSS. Confirmado literalmente.
- src/components/PatternEditor/PatternEditor.css:6 `position: relative; /* anchor for the EmptyState2D overlay */` sin z-index; src/styles/layout.css:33 (`.canvas-area`) y :70 (`.canvas-area__3d`) idem. Los tres son `position:relative` con z-index auto → no crean contexto de apilamiento. Verificado.
- src/components/PatternEditor/FloatingActionBar.tsx:71 `zIndex: 90` vs src/styles/unified-bar.css:5 `z-index: 100`. Y verifiqué la cadena de ancestros completa: `.pattern-editor` → `.canvas-area__2d` (layout.css:36, relative sin z-index) → `.canvas-area` (relative sin z-index) → `.app-shell` (flex sin position). Ningún eslabón aísla. La comparación 90 vs 100 es real y global.
- createPortal: 1 sola ocurrencia en src/ (ToolTooltip.tsx:9 import, :60 uso). Verificado.

> **Nota del verificador:** Confirmado en lo sustancial, con dos precisiones que el auditor no hizo y que corrigen el título. PRIMERO: 'un único contexto de apilamiento plano' es impreciso. `.top-bar` (layout.css:18) lleva `z-index: 10` siendo flex item de `.app-shell` — z-index SÍ aplica a flex items, así que crea contexto de apilamiento; y `.canvas-area__divider` (layout.css:47) es `position:relative; z-index:5` → otro. Ambos accidentales, y ninguna de las superficies en disputa vive dentro de ellos, así que la conclusión aguanta; la frase no. SEGUNDO: la evidencia de '0 isolation' subestima el aislamiento accidental — `.unified-bar`, `.context-panel`, `.render-panel`, `.logo-menu`, `.context-menu`, `.submenu-panel`, `.toast` y `.snapshot-bar` declaran todos `backdrop-filter`, que crea contexto de apilamiento propio. Por eso el `zIndex: 10` de UnifiedBar.tsx:223 sí es local. El aislamiento existe, pero como efecto colateral del cristal, no como decisión. Eso refuerza la tesis en vez de debilitarla: el sistema ordena capas por accidente en las dos direcciones. La regla de contrato propuesta (escala cerrada + lint) es correcta y no es consejo de landing page: no toca densidad ni whitespace.

## [ALTO] La oclusión del lienzo no se compensa en ninguna parte del cálculo de encuadre: se compensa a mano moviendo el cromo, seis veces

- src/store/editorSlice.ts:320-383 — `computeFitView` empieza EXACTAMENTE en 320 y cierra en 383. Firma `(pieces, viewportWidth, viewportHeight, padding = 1.2)` verificada en :320-325. `zoom = Math.min(viewportWidth/(contentW*padding), viewportHeight/(contentH*padding), 5)` en :368-372. `pan.x = viewportWidth/2 - centerX*zoom` en :379. Cero parámetros de inset. Confirmado carácter por carácter.
- src/components/PatternEditor/PatternEditor.tsx:668-677 — `handleZoomToFit`: `const rect = svgEl.getBoundingClientRect(); const fit = computeFitView(pieces, rect.width, rect.height);` en :671-672. Rect crudo. Es el ÚNICO llamador real de computeFitView en todo src/ (verificado por grep).
- src/components/shell/Dock.css:3-19 (`position:absolute; top:50%; padding:7px; border:1px`), :32 (`.dock__tool { width: 38px }`), :19 (`.dock--left { left: 14px }`), reset.css:1 (`box-sizing: border-box`). Aritmética recomprobada: 38+14+2 = 54px de ancho, ocupando x = 14..68. Correcto.
- src/styles/unified-bar.css:3-6 (`position:fixed; z-index:100; width:560px`) y :7 (`height: 58px`); src/components/shell/barPosition.ts:51-54 default `x: (innerWidth-560)/2, y: innerHeight-58-24`. Verificado.
- Las SEIS compensaciones existen textualmente donde dice: (1) floating.css:7-10 `bottom: 94px` con el comentario que cita barPosition.ts; (2) SnapshotBar.css:3-5 `bottom: 94px` con comentario gemelo; (3) ToastContainer.css:6 `bottom: 56px; /* clear the bottom-right Solver pill */`; (4) SurfaceModePill.css:4-7 `right: 8px` con comentario que nombra a FitMapToggle; (5) FitMapToggle.tsx:98-100 `right: 130` con comentario que nombra al SurfaceModePill; (6) floating.css:41 `left: calc(14px + 52px + 12px)`. Seis sitios distintos, seis comentarios que nombran a un tercero.
- El empate mutuo pill↔FitMapToggle es real y son hermanos: Viewport3D.tsx:949 monta FitMapToggle y :1009 SurfaceModePill en el mismo contenedor.

> **Nota del verificador:** Confirmado, y con dos correcciones que lo AGRAVAN, no que lo suavicen. (1) Aritmética de la consecuencia, que el auditor afirmó pero no calculó: con padding=1.2 el margen libre por lado es W*0.0833 cuando el fit está limitado por ancho. Para que ese margen supere los 68px del dock hace falta un pane 2D de ≥816px — o sea que en vista dividida en cualquier portátil el encuadre automático SÍ mete la pieza debajo del dock. En vertical: margen = H*0.0833, y la barra ocupa hasta 82px desde abajo, así que hace falta un canvas de ≥984px de alto; en una pantalla de 900px la pieza encuadrada queda debajo de la barra de IA. La consecuencia para María no es hipotética, es la geometría de portátil por defecto. (2) La compensación 3 es peor de lo que dice: ToastContainer.css:6 reserva 56px permanentes para esquivar a SolverMetrics, que devuelve null salvo en dev (SolverMetrics.tsx:36-38 `if (!import.meta.env.DEV) return null;`). En producción esos 56px esquivan aire. HALLAZGO PROPIO QUE EL AUDITOR NO VIO, en este mismo subsistema y de severidad mayor: src/components/shell/LogoMenu.tsx:83 despacha `{ type: 'editor/computeFitView' }`, pero ese reducer NO EXISTE — el reducer real es `requestFitView` (editorSlice.ts:173, tipo `editor/requestFitView`). Nadie más despacha `editor/computeFitView` (grep). Es decir: Vista ▸ 'Ajustar zoom al patrón' (⌘0), la única puerta MANUAL al encuadre, es un no-op silencioso. Las únicas rutas vivas son automáticas tras importar/restaurar (AppShell.tsx:116, UnifiedBarChat.tsx:161, actionExecutor.ts:962, projectAutosave.ts:56). María no puede re-encuadrar a mano; solo puede panear.

## [ALTO] El orden de apilamiento invierte la jerarquía de urgencia: el scrim modal entierra las notificaciones

- src/components/PatternEditor/CalibrationModal.css:1-9 — `.calibration-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); ... z-index: 1000 }` (z-index en :8). Verificado.
- src/components/shell/ToastContainer.css:3-7 — `position: fixed; right: 16px; bottom: 56px; z-index: 300`. 300 < 1000 confirmado.
- Contexto compartido verificado a mano: `<ToastContainer />` en AppShell.tsx:296 cuelga de `.app-shell`; `{showCalibrationModal && (<CalibrationModal` en PatternEditor.tsx:1069-1070 cuelga de `.pattern-editor` → `.canvas-area__2d` → `.canvas-area`. Recorrí los tres ancestros: ninguno tiene z-index, transform, opacity ni filter. Ambos comparan en la raíz. Además el scrim es `position: fixed`, así que ignora cualquier ancestro no transformado.
- src/components/shared/SubMenu.css:24 `z-index: 1010` — por encima del scrim. Verificado.
- El empate triple en 1000 es real y son tres superficies sin relación: floating.css:180 (`.context-menu`), NotchPrecisionModal.css:9 (`.notch-precision-modal`), CalibrationModal.css:8 (`.calibration-overlay`).
- VERIFIQUÉ LA RUTA VIVA QUE EL AUDITOR DECLARÓ NO HABER VERIFICADO: sí existen emisores asíncronos de toast que pueden dispararse con el modal abierto — src/copilot/hooks/useAgenticLoop.ts:130 (error del agente, que corre en paralelo), src/components/Viewport3D/GarmentSimulation.tsx:1454 (pérdida del dispositivo WebGPU), src/components/Viewport3D/useSimulationLifecycle.ts:481 y :728. Ninguno depende de que el usuario cierre el modal.
- Y la inalcanzabilidad del botón de acción está confirmada: src/components/shell/ToastContainer.css:33 `.toast { pointer-events: auto }`, pero el scrim `inset: 0` a z-1000 con pointer-events por defecto se pinta encima y come el clic. El botón de deshacer de `showUndoToast` (PatternEditor.tsx:250) no solo se ve atenuado: no se puede pulsar.

> **Nota del verificador:** Confirmada la mitad del toast, y más fuerte de lo que el auditor se atrevió a afirmar — encontré la ruta viva que él dejó como 'no filmada'. REFUTADA la mitad del panel de debug: SolverMetrics.tsx:36-38 hace `if (!import.meta.env.DEV) return null;` y el comentario de cabecera :5 lo dice ('Only renders in development mode'). Ese 9999 no existe en ningún build que María ejecute, así que 'una superficie de desarrollo se pinta sobre un velo modal' no es un defecto de producto. Y es un fallo de lectura del auditor, no una diferencia de criterio: su propia regla propuesta dice 'o directamente detrás de un flag de desarrollo' — el flag ya está puesto, no lo comprobó. La mitad del tooltip (ToolTooltip.css:7 a 10000) sí es real pero es inofensiva: es `pointer-events: none` (ToolTooltip.css:15) y el propio auditor lo admite en su regla. Severidad ALTO se sostiene ÚNICAMENTE por el toast bajo el scrim.

## [MEDIO] La altura de la barra unificada tiene tres fuentes de verdad y la única tokenizada es la equivocada

- src/styles/tokens.css:91 `--unified-bar-h: clamp(44px, 3vw, 56px);` — máximo 56. Verificado.
- src/styles/unified-bar.css:6-7 `width: 560px; height: 58px;` — verificado, valor fijo fuera del rango del token.
- src/components/shell/barPosition.ts:9-10 `export const BAR_WIDTH = 560; export const BAR_HEIGHT = 58;`, consumidos en clampPosition (:26 y :28) y loadPosition (:52-53). Verificado.
- `grep -rn -- '--unified-bar-h' src/` → EXACTAMENTE 2 resultados: tokens.css:91 (definición) y floating.css:24 (único consumidor, dentro de `max-height: calc(100vh - var(--top-bar-h) - var(--unified-bar-h) - var(--sp-8))`). Recuento propio, coincide.
- Los dos comentarios que citan la fuente TS en vez del token existen textualmente: floating.css:7-8 ('58px alto + 24px de offset, barPosition.ts') y SnapshotBar.css:3-4 ('58+24, barPosition.ts'). Confirmado.
- Recomprobé el error del único consumidor fiel: token 44px en viewports chicos vs 58 reales = 14px de error, no 2. El 'al menos 2px' del auditor es la cota inferior correcta.

> **Nota del verificador:** Confirmado literalmente; todas las citas son exactas. Dos matices. (1) La lectura honesta es que el token está HUÉRFANO, no 'ignorado por el resto del sistema': tiene un solo consumidor en todo el repo, así que no hay una masa de código que lo desobedezca — hay un token que nadie adoptó nunca. El diagnóstico de fondo (el contrato existe y no obliga) no cambia, pero la escala del incumplimiento es 1 sitio, no muchos. (2) El auditor se quedó corto: hay una CUARTA copia del ancho — unified-bar.css:147 `.unified-bar__panel { width: 560px }` repite el 560 que ya viven en unified-bar.css:6 y barPosition.ts:9. MEDIO es la severidad correcta.

## [MEDIO] Todos los anchos de panel son píxeles duros y no hay un solo breakpoint de viewport, mientras la tipografía y el espaciado sí escalan con vw

- `grep -rn '@media' src/` → 1 resultado en todo el repo: src/styles/base.css:56 `@media (prefers-reduced-motion: reduce)`. Cero breakpoints de ancho. Recontado, correcto.
- Anchos fijos verificados uno por uno en la línea citada: floating.css:23 `width: 300px`; AvatarPanel.css:8 y :16 `260px`; CollisionBodyPanel.css:5 `280px`; RenderSettingsPanel.css:6 `280px`; CalibrationModal.css:16 `340px`; NotchPrecisionModal.css:15 `320px`; Dock.css:132 `width: 220px` (dentro del bloque `.dock-picker` que abre en :127); unified-bar.css:6 y :147 `560px`. Las nueve citas exactas.
- La contradicción con los tokens es real: tokens.css:64-69 son seis `clamp(min, Nvw + Mpx, max)` de tipografía, :76-81 seis de espaciado, y el comentario de :59-61 declara la intención ('scales with viewport... Base: 13px on small screens, scales to ~16px at 2560px+'). tokens.css:90-92 escala incluso las alturas de cromo. Verificado.
- Lo relativo del lado contenedor se limita a lo que dice: Dock.css:133 `max-height: 60vh`, floating.css:24 `max-height: calc(...)`, AppShell.tsx:202-211 `get2dWidth`/`get3dWidth` en porcentaje.

> **Nota del verificador:** CONFIRMADO SOLO A MEDIAS, y bajo de ALTO a MEDIO. Lo que sobrevive: la contradicción interna es real y verificada — el mismo sistema decide que el texto y el padding respiran con el viewport y que las cajas que los contienen no. Eso es deriva legítima y no es consejo de landing page. Lo que REFUTO: (1) 'con splitRatio en su mínimo de 0.15 el pane 2D puede quedar más angosto que el propio dock que flota dentro' es aritméticamente falso. El dock mide 54px; para que 0.15·W < 54 hace falta un viewport de menos de 360px. A 1280px el pane toca fondo en 192px y a 1920px en 288px — siempre varias veces el dock. El ejemplo dramático del hallazgo no ocurre en ninguna pantalla de escritorio. (2) AvatarPanel es un exhibit débil y el auditor no leyó su cabecera: AvatarPanel.css:1 dice 'sidebar that pushes the 3D viewport horizontally instead of overlaying' y `.avatar-panel-wrapper` es `flex-shrink: 0` (:3), o sea una columna en flujo, no una superficie flotante. Sus 260px son un ancho de columna, categoría distinta a los 300px de un panel que flota sobre el lienzo. (3) La mitad de 'fijar un contrato mínimo de viewport con breakpoints' no está sostenida por ninguna evidencia de fallo real: esto es un CAD de escritorio, nadie mostró una pantalla donde se rompa, y 'docks colapsados a iconos / paneles a overlay / split a pestaña única' es prescripción sin síntoma medido. Me quedo con el eje tokens-vs-px, que sí tiene cita; descarto el eje responsive.

## [MEDIO] El panel de contexto de dominio 2D se ancla a la caja equivocada y duplica a ojo la geometría del dock

- src/styles/floating.css:39-43 — comentario de bloque en :39 ('Left-routed panels (2D-domain, e.g. Grading) anchor past the left 2D dock.') y `.context-panel--left { left: calc(14px + 52px + 12px); /* dock at left:14px, ~52px wide, + 12px gap */ right: auto; }` en :40-43. Exacto.
- src/components/shell/AppShell.tsx:287-291 — `<ContextPanel ... side={getPanelSide(contextPanel)}>` es hijo directo de `.canvas-area`, hermano de los panes. `.canvas-area__2d` abre en :264 y cierra en :273. Ambas líneas verificadas.
- src/styles/layout.css:30-35 `.canvas-area { flex: 1; display: flex; position: relative; overflow: hidden; }` — sin padding. Verificado.
- src/components/shell/AppShell.tsx:202-206 `get2dWidth()` devuelve `${splitRatio*100}%`, y :185 `Math.max(0.15, Math.min(0.85, x/rect.width))`. Verificado.
- La medición errónea está confirmada: `.dock` (Dock.css:3-17) con `padding: 7px` y `border: 1px`, `.dock__tool { width: 38px }` (:32), etiqueta '2D' (LeftDock.tsx:60) más angosta que el botón → ancho real 54px, no los '~52px' del comentario. Off by 2.
- El dock vive en otra caja: Dock.tsx:35 `<DockShell side="left">` → DockShell.tsx:17 `<div className={'dock dock--left'}>`, renderizado dentro de `.canvas-area__2d` (AppShell.tsx:268). Verificado.
- La ruta está viva: src/components/shell/panelSide.ts:9 `const LEFT_PANELS = new Set(['Grading', 'Properties'])`. Properties es un panel de uso diario, no superficie oscura.

> **Nota del verificador:** Confirmado el hecho (geometría ajena transcrita a ojo, mal medida, en un archivo que no es el dueño), REFUTADA la explicación. El auditor dice 'está en el sistema de coordenadas equivocado... el offset es incorrecto por construcción y ningún valor lo arregla'. Es falso y se comprueba leyendo AppShell: `.canvas-area__2d` es el PRIMER hijo flex de `.canvas-area` (AppShell.tsx:264; el overlay de drag que lo precede es `position:absolute`, fuera de flujo) y `.canvas-area` no tiene padding (layout.css:30-35), así que ambas cajas comparten el mismo origen izquierdo y `left: 78px` resuelve exactamente a la misma x de pantalla se ancle donde se ancle. El número está bien puesto hoy; lo que falta no es el ancla sino el LÍMITE DERECHO — el panel de 300px nunca se recorta contra el pane, así que 78+300=378 cruza el divisor en cuanto el pane 2D baja de ~378px (a 0.15 de split, por debajo de ~2520px de viewport, o sea siempre en vista dividida). Y añado un segundo defecto real que el auditor no vio: en `viewMode === '3d'` el pane 2D recibe `display: none` (AppShell.tsx:266) y el dock no se renderiza, pero `.context-panel--left` sigue reservándole 78px — Properties se abre a la izquierda esquivando un dock que no está en pantalla. Ese caso sí es 'esquivar aire', y es el mismo patrón que el hallazgo de la barra arrastrable. MEDIO es correcto.

## [ALTO] 59 componentes de ícono dibujados a mano que ninguna superficie renderiza, mientras el dock vivo trae un segundo catálogo lucide para los mismos tool ids

- src/tools/types.ts:32 dice literalmente `icon: React.FC<{size?: number}>; // SVG icon component` y NO es opcional — verificado leyendo la interfaz completa (líneas 26-44).
- `ls src/tools/definitions | wc -l` = 59. Confirmado.
- src/tools/definitions/pen.tsx:5 es exactamente `const PenIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (` con viewBox="0 0 18 18" y strokeWidth={1.5}. Confirmado textual.
- src/components/shell/dock2dTools.ts:11 `icon: LucideIcon;` y :29 `{ id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H' }`. Confirmado. Las líneas 23/24/28/30 (select/editPattern/point/line con MousePointer2/PenLine/GitCommitHorizontal/Minus) también dan exacto.
- PRUEBA DECISIVA que recorrí yo: `grep -rn "from '.*/tools'"` en todo src (excluyendo copilot/action) devuelve UN solo import: src/components/Viewport3D/Viewport3D.tsx:67. Y `getTool(`/`getAllTools` fuera de src/tools aparece solo en Viewport3D.tsx:264 `toolRegistry.getTool(activeTool3D)?.cursor`. El registry NUNCA se lee por `.icon` desde ninguna superficie.
- `grep -c icon src/tools/copilotSchemas.ts` = 0 (exit 1). El otro consumidor de getAllTools tampoco toca el campo.
- Recuento propio de viewBox en src/tools/definitions: 18×18 ×58, 24×24 ×2, 20×20 ×1. Idéntico a lo afirmado. strokeWidth: {1.5}×58, "1.5"×1, {2}×6, {0.75}×2, "1"×1.
- src/tools/definitions/polyPen.tsx:4-5 `const PolyPenIcon = () => (` con `<svg width="20" height="20" viewBox="0 0 20 20"` — confirmado que NO acepta `size`, incompatible con el tipo del contrato en la práctica.
- src/tools/definitions/meshSelect.tsx:6 viewBox 0 0 24 24 con strokeWidth={2}. Confirmado.
- EVIDENCIA EXTRA que el auditor no citó y refuerza el hallazgo: src/tools/renderTools.ts:4 define `const NoopIcon: React.FC<{ size?: number }> = () => null;` y lo asigna en 7 herramientas (líneas 13, 69, 109, 147, 185, 242, 266). O sea: el campo obligatorio ya obligó a inventar un ícono nulo siete veces. El costo futuro que el auditor predice ya se está pagando.

> **Nota del verificador:** Confirmado sin reservas; es el hallazgo mejor sostenido del lote. Única imprecisión: dice «5 grosores» y enumera 4 valores (son 5 formas literales distintas si cuentas `strokeWidth={1.5}` vs `strokeWidth="1.5"`). No cambia nada. La regla de contrato propuesta es sensata pero ojo: borrar el campo `icon` obliga a tocar renderTools.ts y los 59 archivos; el NoopIcon sugiere que la ruta barata es hacer el campo opcional primero.

## [ALTO] La escala tipográfica existe y se ignora POR ARCHIVO: corte bimodal, 19 de 24 archivos nunca la tocan

- src/styles/tokens.css:64-69 son exactamente los 6 pasos (--text-xs a --text-title), verificado contando líneas desde el comentario /* Typography */ en :59. `--text-xs: clamp(10px, 0.55vw + 3px, 13px)` y `--text-title: clamp(16px, 0.9vw + 4px, 20px)` dan textual.
- Recorrí YO los 27 .css con `font-size` contando token vs crudo. Resultado: 19 archivos con 0 tokens (BOMTab 12, AvatarPanel 19, InspectorTab 11, LayerPanel 11, unified-bar 10, GradingTab 9, ErrorBoundary 9, CollisionBodyPanel 8, NestingTab 7, Dock 6, CalibrationModal 5, EmptyState2D 5, ToolTooltip 4, ReferenceImageSettings 4, SnapshotBar 3, ToastContainer 3, SolverMetrics 2, SurfaceModePill 2, Viewport3D.css 1); 5 puros de token (PropertiesPanel 20/0, NotchPrecisionModal 6/0, base.css, layout.css, reset.css); 3 mixtos (floating 7/4, SubMenu 4/2, RenderSettingsPanel 3/2).
- TODAS las cifras por archivo que el auditor citó dan exactas: PropertiesPanel.css 20/0, AvatarPanel.css 0/19, BOMTab 0/12, LayerPanel 0/11, InspectorTab 0/11, unified-bar 0/10, GradingTab 0/9, CollisionBodyPanel 0/8, NestingTab 0/7, Dock 0/6, y los 3 mixtos con sus números.
- src/components/PropertiesPanel/PropertiesPanel.css:109 es `font-size: var(--text-xs);` dentro de `.panel-value` (:108). Confirmado.
- src/components/Viewport3D/AvatarPanel.css:305 y :312 son `font-size: 10px;`. Confirmado línea por línea.
- En .tsx: `fontSize: 'var(--text-*)'` aparece exactamente 5 veces, TODAS en un solo archivo (UnifiedBarChat.tsx:245, 277, 327, 341, 365). Valores crudos: 113 en mi conteo (el auditor dijo 112). src/components/Viewport3D/FitMapToggle.tsx:322 es `<div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>`. Confirmado.
- La aritmética del efecto en pantalla es correcta: a 2560px, --text-xs = clamp(10, 0.55*25.6+3=17.08, 13) → 13px, contra un 11px crudo que no se mueve. 18% de diferencia entre etiquetas hermanas.

> **Nota del verificador:** Confirmado. Corrijo el denominador: son 27 archivos .css con font-size, no 24 — el auditor probablemente descontó base/layout/reset (los globales con 1 declaración). El numerador que sostiene la tesis (19 puros crudos, 3 mixtos, 5 puros token) es exacto. NO es consejo de landing page: no pide menos densidad ni más aire, pide que dos etiquetas hermanas visibles al mismo tiempo no diverjan 18% en un monitor grande, que es justo donde María trabaja.

## [ALTO] Ocho stacks tipográficos declarados para tres webfonts, y --font-mono contra --font-mono-2d invierten la prioridad del MISMO par de fuentes

- index.html carga exactamente 3 familias (Inter, JetBrains Mono, Schibsted Grotesk) — confirmado, PERO la línea es la 10, no la 9 (la 9 es el preconnect a fonts.gstatic.com).
- src/styles/tokens.css:63 `--font-mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;` y :37 `--font-mono-2d: 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace;`. Confirmado: mismas dos primeras fuentes, orden invertido. :62 --font-sans y :38 --font-ui-2d también exactos.
- Los 5 sitios con `'SF Mono', 'Fira Code', monospace` (sin JetBrains) los recorrí con grep sobre todo src: unified-bar.css:229, ToolTooltip.css:57, AgentSettings.tsx:136, DynamicProviderForm.tsx:53, UnifiedBarChat.tsx:309. Exactamente esos 5, ni uno más ni uno menos.
- src/components/Debug/SolverMetrics.css:10 `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;`. Confirmado.
- src/components/ErrorBoundary/ErrorBoundary.css:59 `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. Confirmado, y no contiene Inter.
- `monospace` pelado: ConstructionOverlay.tsx:80 y :115, CalibrationOverlay.tsx:117, SlashAndSpreadOverlay.tsx:274, SimulationStatusOverlay.tsx:82, CusickHarness.tsx:275 — los 6 confirmados por grep de fontFamily en .tsx.
- Conteo de stacks distintos hecho por mí: 8 (--font-sans, --font-mono, --font-mono-2d, --font-ui-2d, 'SF Mono'/'Fira Code', ui-monospace/SFMono-Regular/Menlo/Monaco, -apple-system/Segoe UI/Roboto, monospace pelado). El razonamiento de resolución en Windows es correcto: sin SF Mono ni Fira Code instaladas, esos 5 sitios caen al monospace genérico.

> **Nota del verificador:** Confirmado. Un error de cita: index.html:9 debe ser index.html:10. Encontré un noveno stack que el auditor no vio y que refuerza el punto: src/components/shell/ToastContainer.css:30 `font-family: var(--font-sans, Inter, sans-serif)` — un fallback en línea del token, o sea una décima manera de escribir lo mismo.

## [ALTO] El mismo comando muestra dos íconos de dos lenguajes visuales distintos, y el código documenta la decisión de no tocar el viejo

- src/components/PatternEditor/actionCuration.ts:94 es `icon: string;` dentro de `export interface ActionDef` (:91). Confirmado.
- `grep -c "icon: '"` en actionCuration.ts = 43. La cifra de 43 glifos es exacta.
- Cada línea citada da textual: :160 rotate90 icon '↻'; :220 lockToggle icon '🔒'; :226 groupCreate icon '📁'; :245 linkSymmetry icon '🪞'; :255 duplicate icon '⧉'; :261 properties icon '🎛'. Verifiqué las 6 contando líneas dentro de los bloques 158-162, 218-228, 243-247 y 253-263.
- src/components/PatternEditor/barIcons.ts:3-4 dice literalmente «el menú de clic-derecho conserva `ACTIONS[id].icon` (emoji, status quo) — este mapa NO lo toca». La confesión existe y está donde el auditor dice.
- barIcons.ts:20-29 tiene exactamente 9 entradas lucide (rotate90:RotateCw, duplicate:Copy, flipH:FlipHorizontal2, properties:SlidersHorizontal, lockToggle:Lock, duplicateAll:Copy, groupCreate:Group, linkSymmetry:Link2, linkInstance:Link). Confirmado.
- src/components/PatternEditor/ContextMenu.tsx:168 `<span className="context-menu__icon">{def.icon}</span>` — renderiza el emoji. Confirmado.
- src/components/PatternEditor/FloatingActionBar.tsx:83 `const Icon = BAR_ICONS[def.id];` y :106 `{Icon && <Icon size={16} />}`. Ambas confirmadas contando dentro del bloque 80-110.
- Extra que verifiqué: el test src/components/PatternEditor/__tests__/barIcons.test.ts:24-30 CONGELA la duplicación — `it('NO toca ActionDef.icon: el menú conserva su emoji (cero regresión)')` con `expect(ACTIONS.rotate90.icon).toBe('↻')` y `expect(BAR_ICONS.rotate90).not.toBe(ACTIONS.rotate90.icon)`. Hay un test verde que exige que las dos superficies difieran.

> **Nota del verificador:** Confirmado y más grave de lo que el auditor dijo. No es solo que la deriva esté confesada en un comentario: está ATADA POR UN TEST. barIcons.test.ts:30 falla si alguien unifica los dos íconos. La regla propuesta (cambiar `icon: string` a LucideIcon) tiene que borrar esa aserción primero, si no el gate va a defender la duplicación.

## [ALTO] Cuatro mecanismos distintos para dimensionar un ícono, y el prop `size` es letra muerta en tres superficies

- Recontéic yo el censo de `size={N}` en .tsx (sin tests): 12×11, 16×10, 14×8, 15×2, 9×1, 18×1, 10×1. SIETE tamaños distintos, y CADA conteo coincide con lo afirmado.
- Las 8 líneas citadas dan textual una por una: DockAutoZone.tsx:59 `<BadgeIcon size={9} />`, PropertiesPanel.tsx:95 `<X size={10} />`, LogoMenu.tsx:244 `<ChevronDown size={12} />`, TopBar.tsx:47 `<Undo2 size={14} />`, DockToolPicker.tsx:37 y UnifiedBarCommands.tsx:64 `size={15}`, Dock.tsx:56 `<Icon size={16} />`, UnifiedBar.tsx:273 `<ArrowUp size={18} />`.
- src/styles/base.css:52 `.icon-btn svg { width: 50%; height: 50%; }` con el comentario en :51. `.icon-btn` (base.css:41-42) usa `width: var(--toolbar-btn); height: var(--toolbar-btn);`. Confirmado.
- El choque de TopBar es real: TopBar.tsx:40 `className="icon-btn"` y :47 `<Undo2 size={14} />`. Lucide emite width/height como ATRIBUTOS de presentación (especificidad 0), así que la regla CSS `.icon-btn svg` (0,0,1,1) gana siempre. El `size={14}` no hace nada. Confirmado mecánicamente, no de oídas.
- unified-bar.css:74 `.unified-bar__mode-btn svg { width: 16px; height: 16px; }` contra UnifiedBar.tsx:250 `<Icon size={16} />`; unified-bar.css:121 `.unified-bar__send svg { width: 18px; height: 18px; color: #fff; }` contra UnifiedBar.tsx:273 `<ArrowUp size={18} />`. Las cuatro citas exactas.
- floating.css:230-235 `.context-menu__icon { width:20px; text-align:center; font-size:14px; flex-shrink:0 }` y SubMenu.css:14 `.submenu-icon { width: 20px; text-align: center; font-size: 14px; flex-shrink: 0; }` — comparé carácter por carácter: la declaración es idéntica salvo el selector. Copia-pega literal confirmada.
- FloatingActionBar.tsx:96-97 `width: 28, height: 28` con el ícono a 16 en :106. Confirmado.

> **Nota del verificador:** Confirmado. UN error de cita: `--toolbar-btn: clamp(28px, 2vw, 38px)` está en tokens.css:92, no en :85 (la 85 es `--radius-md: 8px`). El valor citado sí es correcto. Matiz que el auditor no dio y conviene guardar: la regla base.css:52 tiene comentario propio («Scale SVG icons inside buttons to 50% of button size»), o sea fue deliberada — el problema no es que exista, es que convive con el prop sin que nadie declarara cuál manda.

## [ALTO] En un CAD, `tabular-nums` existe en 5 archivos y falta justo en los lectores numéricos principales

- src/components/PropertiesPanel/PropertiesPanel.css:108-113 es exactamente `.panel-value { font-size: var(--text-xs); color: var(--text-muted); min-width: 36px; text-align: right; }` — SIN font-variant-numeric. Confirmado leyendo el bloque completo.
- src/styles/reset.css:4 `font-family: var(--font-sans);` en `body` → `.panel-value` hereda Inter (proporcional por defecto). Confirmado.
- src/components/Viewport3D/AvatarPanel.css:308-314 tiene `.ap-joint-axis span { width: 36px; text-align: right; color:…; font-size: 10px; font-variant-numeric: tabular-nums; }`. Misma intención (36px alineado a la derecha), este sí lo trae. El contraste que el auditor señala es real y está en el mismo repo.
- src/components/Viewport3D/CollisionBodyPanel.css:142-147 `.cb-slider-value { width: 40px; font-size: 11px; text-align: right; color: #bbb; }` — tercera variante, sin tabular, con hex crudo. Confirmado textual.
- Los consumidores de `.panel-value` con números vivos: SeamPropertiesPanel.tsx:216 `{seam.strength.toFixed(2)}` (dentro de un onChange de slider, verificado en :214-216), PieceProperties.tsx:333 `{((piece.solidifyFactor ?? 0) * 100).toFixed(0)}%`, y MaterialTab.tsx:272 `{(uv.offsetX ?? 0).toFixed(2)}` — este último vive en src/components/PropertiesPanel/MaterialTab.tsx (el auditor citó el basename sin ruta; NO existe en BottomPanel/). Los tres confirmados.
- src/components/Viewport3D/CollisionBodyPanel.tsx:167 `<span className="cb-slider-value">{(body.collision.offset * 1000).toFixed(1)}mm</span>`. Confirmado.
- AvatarTapes.tsx: `<Html … center>` en :45-47, `fontSize: 11` en :55, `fontFamily: 'var(--font-sans)'` en :56, `fontWeight: 600` en :57, y el contenido `{tape.label}: {formatMm(tape.measurement)}` en :61. El segundo bloque repite el patrón en :92-94. La etiqueta es proporcional, centrada y su ancho cambia con el valor. Confirmado.
- Recuento propio de tabular-nums en todo src: 11 ocurrencias. Confirmado.

> **Nota del verificador:** Confirmado. Dos correcciones menores: las 11 ocurrencias viven en 6 ARCHIVOS (BOMTab.css y BOMTab.tsx son dos), aunque sí en 5 componentes; y MaterialTab.tsx es el de PropertiesPanel/, no el de BottomPanel/. La afirmación «todos paneles analíticos agregados tarde» no la pude verificar sin git blame y no sostiene nada. Lo demás aguanta: min-width:36px en `.panel-value` es la huella de alguien peleando con el ancho variable sin usar la fuente. NO es estética: un número que se mueve mientras lo lees en un slider es defecto de uso.

## [ALTO] 8.5px en una etiqueta permanente del dock, a ~3.6:1 de contraste — falla AA por tamaño y por contraste a la vez

- src/components/shell/Dock.css:68-73 es textual: `.dock__auto-label { font-family: var(--font-mono); font-size: 8.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-ghost); }`. Confirmado línea por línea.
- src/components/shell/DockAutoZone.tsx:73 `<div className="dock__auto-label">auto</div>` — confirmado contando dentro del return (:67-78). Es superficie viva, se renderiza cuando `!off && suggested.length > 0`.
- src/components/shell/Dock.css:13 `background: var(--bg-surface);` y tokens.css:5 `--bg-surface: #10101c`, tokens.css:14 `--text-ghost: #6a6a8a`. Confirmados.
- RECALCULÉ el contraste yo mismo con la fórmula WCAG (linealización sRGB + 0.05): L(#6a6a8a)=0.1522, L(#10101c)=0.00564, ratio = 3.63:1. El auditor dijo 3.65 — diferencia de redondeo. Falla los 4.5:1 de AA y 8.5px está lejísimos del umbral de texto grande (18.66px bold / 24px).
- La deriva entre hermanos del mismo archivo es real: Dock.css:22-28 `.dock__label { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-muted); padding: 2px 0 4px; }`. Verifiqué las dos reglas en el mismo archivo: distinto tamaño, distinto tracking, distinto color, y el 700 sin token.
- DockAutoZone.tsx:59 `<BadgeIcon size={9} />` confirmado. El cálculo del trazo es correcto: lucide dibuja en viewBox 24 con strokeWidth 2 → 2*(9/24) = 0.75px efectivos.

> **Nota del verificador:** Confirmado en los hechos. Sobre la severidad: el propio auditor se autolimita («no lo llamo BLOQUEANTE») y hace bien; yo lo dejaría en MEDIO-ALTO, porque es UNA etiqueta decorativa de zona, no un control. Lo que sí sostiene el ALTO no es el píxel sino el par: dos etiquetas hermanas en el MISMO archivo, ninguna con token, con 4 propiedades divergentes. Ese es el argumento fuerte y está probado.

## [MEDIO] `fontFamily="monospace"` muerto en el canvas 2D: el atributo de presentación SVG pierde contra la regla CSS, y el comentario que instauró la regla legitima el bypass

- src/components/PatternEditor/PatternEditor.css:47-49 `.pattern-svg text { font-family: var(--font-ui-2d); }`. Confirmado.
- El comentario en :44-46 dice literalmente «Los renderers con intencion propia (labels mono) la declaran inline y ganan». La puerta trasera está escrita dentro del contrato, tal cual lo afirma el auditor. Confirmado palabra por palabra.
- PatternEditor.tsx:815 `<svg`, :817 `className="pattern-svg"`, :1032 `</svg>`. Los tres confirmados contando líneas. Todo overlay montado entre 817 y 1032 hereda la regla.
- PatternEditor.tsx:855 `<ConstructionOverlay zoom2D={zoom2D} pieces={pieces} />` y :1005 `<CalibrationOverlay` — ambos DENTRO del rango del svg. Confirmado.
- ConstructionOverlay.tsx:80 y :115 son `fontFamily="monospace"` como atributo JSX suelto en un `<text>` (verificado leyendo los bloques 75-85 y 110-120). CalibrationOverlay.tsx:117 y SlashAndSpreadOverlay.tsx:274, idéntico patrón.
- Rastreé la cadena de montaje de SlashAndSpreadOverlay que el auditor solo insinuó: ToolOverlay.tsx:316 `<SlashAndSpreadOverlay` bajo el guard `activeTool === 'slashAndSpread'` (:315), y ToolOverlay se monta en PatternEditor.tsx:881 — dentro del svg. La cadena cierra.
- PieceRenderer.tsx:417 `style={{ fill: 'var(--ink-on-light)', fontFamily: 'var(--font-mono-2d)', cursor: 'pointer' }}` — estilo inline, gana. Confirmado.
- El mecanismo CSS es correcto y lo verifiqué contra la spec, no de memoria: los atributos de presentación SVG tienen especificidad 0 y pierden contra CUALQUIER regla de hoja de estilo. Los 4 sitios que piden monospace por atributo reciben Schibsted Grotesk.

> **Nota del verificador:** Confirmado, todas las citas exactas. Es el hallazgo que mejor ilustra la tesis del dueño: no hay contradicción entre archivos, hay un contrato que se escribió incluyendo su propia excepción abierta. MEDIO es la severidad correcta — son etiquetas de construcción y calibración, no controles.

## [MEDIO] Tres tokens de peso con 8 usos en toda la app; el peso 700 vive en 12 sitios sin token, y --weight-normal tiene cero

- src/styles/tokens.css:70-72 son `--weight-normal: 400; --weight-medium: 500; --weight-semibold: 600;`. Confirmado contando desde el bloque /* Typography */.
- Grepée los tres tokens en todo src: 8 usos exactos. --weight-semibold ×5 en PropertiesPanel.css:48, RenderSettingsPanel.css:41, floating.css:51, floating.css:74, unified-bar.css:182. --weight-medium ×3 en PropertiesPanel.css:105, :274, :297. --weight-normal ×0. Los tres conteos y las 8 líneas dan exactos.
- Recuento crudo propio: `font-weight: 600` = 21 en CSS, `fontWeight: 600` = 29 en TSX, `font-weight: 500` = 3 en CSS y 2 en TSX. Las cuatro cifras coinciden con lo afirmado.
- Los 12 sitios de peso 700 los listé yo con grep y salen EXACTAMENTE los 12 citados: BOMTab.css:132 y :202, Dock.css:25, unified-bar.css:216 y :226 (`.chat-markdown strong { … font-weight: 700; }`), FitMapToggle.tsx:322, :502, :518, :535, :553, :565, ConnectionCard.tsx:68. Ni uno más.
- La aritmética del 11% cierra: 21+29+3+2+12 = 67 crudas contra 8 con token.
- index.html carga Inter en 400;500;600;700 — el 700 está pagado y en producción, fuera del sistema de tokens. Confirmado (línea 10).

> **Nota del verificador:** Confirmado con precisión inusual — es el hallazgo con los conteos mejor hechos del lote; verifiqué las cinco cifras independientemente y las cinco dan. El argumento «la escala describe una app que no existe» está probado por los dos extremos a la vez: un token con 0 usos y un peso con 12 usos y 0 token.

## [MEDIO] ToolTooltip se construyó una tipografía propia completa —incluidos 10.5px y 11.5px, tamaños que no existen en ninguna escala—, y unified-bar mide en em

- src/components/shell/ToolTooltip.css:48-52 `.tool-tooltip-name { font-size: 13px; font-weight: 600; color: #f0f0f0; font-family: var(--font-sans); }`. Confirmado.
- ToolTooltip.css:55-63 `.tool-tooltip-shortcut { font-size: 11px; font-family: 'SF Mono','Fira Code',monospace; background:#2a2a2a; border:1px solid #444; border-radius:4px; padding:1px 6px; color:#aaa; line-height:1.4; }`. Confirmado línea por línea.
- ToolTooltip.css:66-72 con `font-size: 11.5px; color: #999;` y :76-82 con `font-size: 10.5px; color: #666; font-style: italic;`. Los dos valores fraccionarios EXISTEN y están donde dice.
- «4 declaraciones de font-size, 0 tokens» — recontado por mí: correcto (tok=0, raw=4).
- src/styles/unified-bar.css:228-234 `.chat-markdown code { font-family: 'SF Mono','Fira Code',monospace; font-size: 0.88em; background: var(--bg-elevated); padding:1px 4px; border-radius:4px; }`. Confirmado, con el 0.88em en :230.
- src/components/shell/Dock.css:69 `font-size: 8.5px;` confirmado (cuarto valor fraccionario).

> **Nota del verificador:** Confirmado el núcleo, con DOS correcciones de dato. (1) Dice «6 colores hex crudos» en ToolTooltip.css; los distintos son 8: #1a1a1a, #2a2a2a, #3a3a3a, #444, #666, #999, #aaa, #f0f0f0 — el auditor se quedó corto, no largo. (2) FALSO que 0.88em sea «la única unidad relativa de tamaño en todo el repo»: src/components/Viewport3D/Viewport3D.tsx:80, :81 y :83 usan fontSize '0.85rem', '1.2rem' y '0.75rem'. Lo cierto es que es el único `em` (que sí depende del contenedor, mientras rem depende de la raíz), así que el argumento de fondo sobrevive pero la frase hay que corregirla antes de citarla.

## [BAJO] La pantalla de error se sale del sistema tipográfico entero

- src/components/ErrorBoundary/ErrorBoundary.css:57-59 `color: #e0d8cc; background: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;` dentro de `.app-error-boundary` (:50). Confirmado.
- ErrorBoundary.css:62-64 `.app-error-icon { font-size: 48px; margin-bottom: 16px; }` y :67-69 `.app-error-title { font-size: 20px; font-weight: 600; }`. Ambos exactos.
- Balance recontado por mí: 9 declaraciones de font-size y CERO ocurrencias de `var(--` en todo el archivo. Confirmado con grep -c.
- `grep -n e0d8cc src/styles/tokens.css` no devuelve nada: el beige no está en el sistema (que es azul medianoche, --bg-surface #10101c). Confirmado.
- src/styles/reset.css:3-8 `body { font-family: var(--font-sans); font-size: var(--text-ui); … }`. El contraste que plantea es real.
- VERIFIQUÉ LA HIPÓTESIS DEFENSIVA que el auditor concedió a medias: ErrorBoundary.css se importa como módulo ES desde AppErrorBoundary.tsx:4 y PanelErrorBoundary.tsx:2, o sea entra al MISMO bundle CSS que tokens.css. Si tokens.css no cargó, ErrorBoundary.css tampoco. La excusa «no dependas de los tokens por si todo falló» no se sostiene técnicamente.

> **Nota del verificador:** Confirmado, y con un dato que el auditor no tenía: la posible justificación defensiva es hueca porque ambos archivos viajan en el mismo bundle. Eso convierte esto de «excepción quizá deliberada» a «una ráfaga más que trajo sus propios principios». Aun así BAJO es la severidad correcta: María ve esta pantalla poco. Su valor es de evidencia, no de impacto.

## [ALTO] RenderSettingsPanel se pinta con el CSS privado de AvatarPanel, que viaja en un chunk lazy: el panel de Render y Export sale sin estilo hasta que abras Avatar

- src/components/Viewport3D/renderSections/EnvironmentSection.tsx:31,32,33 — `<div className="ap-section">`, `<button className="ap-section-header">`, `<span className={`ap-chevron ${open ? 'open' : ''}`}>` — verificado literal
- src/components/Viewport3D/AvatarPanel.css:68 — `.ap-section { border-bottom: 1px solid rgba(255, 255, 255, 0.06); }` — línea EXACTA
- grep de definiciones `.ap-` en todos los .css de src/: un solo archivo, AvatarPanel.css. RenderSettingsPanel.css (125 líneas, leído completo) no declara NINGUNA regla ap-*
- src/components/Viewport3D/AvatarPanel.tsx:18 — `import './AvatarPanel.css';` — único importador en todo el repo (grep confirmado)
- src/components/shell/AppShell.tsx:25 — `const AvatarPanel = lazy(() => import('../Viewport3D/AvatarPanel'));` — EXACTO
- src/components/Viewport3D/Viewport3D.tsx:967 — `<RenderSettingsPanel open={renderPanelOpen} .../>` sin lazy — EXACTO
- 84 usos de `ap-*` en renderSections/ — RECONTADO: 84 exacto
- vite.config.ts: no desactiva cssCodeSplit (default true) — leído completo
- PRUEBA DURA EN EL BUILD REAL (dist/assets/): `.ap-section{` aparece SOLO en `AvatarPanel-HRaHsH8_.css` (chunk lazy). `render-panel-wrapper` aparece en `bootstrap-Dh7tlXW5.css` (chunk ansioso). Cero coincidencias de ap-section en bootstrap. El artefacto compilado confirma la separación.
- Puerta real del panel verificada: src/store/renderSettingsThunk.ts:25 + LogoMenu.tsx:56 + unifiedBarCommandDefs.ts:62 — el panel SÍ es alcanzable por María

> **Nota del verificador:** El mecanismo es real y lo probé contra el build compilado, no solo contra el fuente. Pero BAJO la severidad de BLOQUEANTE a ALTO y corrijo dos detalles del auditor: (1) «sin acordeón» es falso — el colapso lo maneja el estado de React (`{open && ...}`), sigue funcionando sin CSS; (2) «sin chevron» es falso — el glifo `&#9656;` está en el JSX y renderiza igual, lo que falta es la rotación de `.ap-chevron.open`. Lo que SÍ se rompe: el borde separador de las 8 secciones, el padding de `.ap-section-body`, y los `.ap-btn` / `.ap-select` / `.ap-slider-*` caen a controles nativos del SO. Además el `<button>` de cabecera pasa a botón nativo inline-block. Ojo: `.render-hdri-grid` y `.render-hdri-item` SÍ están en el chunk ansioso, así que el panel queda mestizo — una rejilla HDRI bien pintada encima de ocho botones nativos. Degrada feo y depende del orden de sesión, pero no impide usarlo. Hallazgo sólido.

## [ALTO] Existe un host de panel compartido (ContextPanel) con Escape y click-fuera, y tres paneles lo bypassean o lo duplican por dentro: pierden comportamiento, no solo estilo

- src/components/shell/ContextPanel.tsx:16-22 — `useEffect` Escape con `window.addEventListener('keydown', handler)` — EXACTO
- src/components/shell/ContextPanel.tsx:25-39 — `useEffect` click-fuera con `mousedown` + `setTimeout` de 100ms — EXACTO
- src/components/shell/ContextPanel.tsx:45-46 — `<button className="icon-btn" ...><X size={14} /></button>` — EXACTO
- src/components/shell/AppShell.tsx:288 — `<ContextPanel title={PANEL_LABELS[contextPanel] ?? contextPanel} side={getPanelSide(contextPanel)} onClose={...}>` — línea EXACTA (verificada con grep -n)
- src/components/Viewport3D/CollisionBodyPanel.tsx:60-66 — `cb-panel-wrapper` / `cb-panel` / `cb-panel-header` / `<button className="cb-panel-close">&times;</button>` / `cb-panel-scroll` — RANGO EXACTO, contado línea por línea
- src/components/Viewport3D/RenderSettingsPanel.tsx:34-41 — `render-panel-wrapper` / `render-panel` / `render-panel-header` / `<button className="render-panel-close">&times;</button>` / `render-panel-scroll` — RANGO EXACTO
- grep de `Escape|mousedown|keydown` en ambos paneles: exit 1, CERO coincidencias — confirmado
- Dos glifos de cerrar convivientes confirmados: `<X size={14}/>` de lucide (ContextPanel.tsx:46) vs `&times;` (RenderSettingsPanel.tsx:38 y CollisionBodyPanel.tsx:64)

> **Nota del verificador:** Confirmado, pero corrijo la aritmética: NO son «7 de 9». Verifiqué que Viewport3D se monta una sola vez y siempre con `hideChrome` (AppShell.tsx:284), y que el ÚNICO opener de CollisionBodyPanel es el botón de Viewport3D.tsx:978 gateado por `{!hideChrome && ...}` — o sea, `setCollisionPanelOpen(true)` es inalcanzable: CollisionBodyPanel es una superficie oscura hoy. La cuenta real es 7 paneles hospedados + 1 bypass alcanzable (Render/Export) + 1 bypass muerto (Collision Bodies). El daño a la usuaria queda en un solo panel, no dos. Lo que sí es 100% real y sí lo toca María: pulsa Escape sobre Render y Export y no pasa nada, y ve dos glifos de cerrar distintos en la misma sesión. El contrato existe en código y se bypassea — eso se sostiene entero.

## [ALTO] AvatarPanel pinta una losa opaca de 260px DENTRO del panel de cristal que lo hospeda — interfaz sobre interfaz, literal — y arrastra 34 líneas de CSS muerto

- src/components/shell/AppShell.tsx:57 — `return <Suspense fallback={fallback}><AvatarPanel open /></Suspense>;` — línea EXACTA (verificada con grep -n)
- src/styles/floating.css:19-32 — `.context-panel { ... width: 300px; background: rgba(8, 8, 15, 0.95); backdrop-filter: var(--blur); border: 1px solid var(--border); border-radius: var(--radius-xl); z-index: 25; }` — BLOQUE EXACTO, contado línea por línea (abre en 19, cierra en 32)
- src/components/Viewport3D/AvatarPanel.css:15-24 — `.avatar-panel { width: 260px; height: 100%; background: var(--bg-secondary, #1e1e1e); border-left: 1px solid var(--border, ...); ... }` — BLOQUE EXACTO
- src/App.css:15 — `--bg-secondary: #242424;` — EXACTO. El token EXISTE, así que el fondo es un opaco #242424 real, no el fallback
- src/components/Viewport3D/AvatarPanel.tsx:181-185 — wrapper + `.avatar-panel` + comentario «Fase1-S6: sin header propio — el host (ContextPanel "Avatar") ya pone título y botón de cerrar; aquí había un segundo par.» — RANGO EXACTO
- src/components/Viewport3D/AvatarPanel.css:26-59 — `.avatar-panel-header` (26-33), `.avatar-panel-header h3` (35-40), `.avatar-panel-close` (42-54), `:hover` (56-59). Son 34 líneas EXACTAS
- grep de `avatar-panel-header|avatar-panel-close` en .tsx/.ts de todo src/: exit 1, CERO consumidores — CSS muerto confirmado
- src/components/PropertiesPanel/PropertiesPanel.css:1-5 — la cabecera dice literalmente «The glass chrome (background, border, blur, radius, body padding) belongs to .context-panel in styles/floating.css; this file only styles content.» — el contrato que AvatarPanel viola ya está escrito en otro archivo

> **Nota del verificador:** Confirmado sin una sola corrección. Es el hallazgo mejor citado del lote: los cuatro rangos de línea son exactos al dígito. Verifiqué además dos cosas que el auditor no dijo y que lo refuerzan: (1) 300px de ancho menos el padding de `.context-panel__body` (var(--sp-4) = 16..20px por lado) deja ~258-266px de hueco para una losa de 260px fijos — en pantallas grandes desborda y `.context-panel` tiene `overflow-y: auto`, o sea que puede aparecer barra horizontal; (2) `.viewport3d-avatar-toggle` (AvatarPanel.css:317-341) es OTRO bloque muerto en el mismo archivo, cero consumidores en .tsx. El CSS zombi de AvatarPanel es mayor que las 34 líneas denunciadas.

## [ALTO] Dos registros de tokens vivos a la vez, con nombres semánticos duplicados y valores distintos para el mismo concepto

- src/styles/tokens.css:21-23 — `--success: #22c55e; --destructive: #ef4444; --warning: #f59e0b;` — EXACTO
- src/App.css:26-28 — `--color-error: #ef4444; --color-warning: #cca700; --color-success: #10b981;` — EXACTO
- src/App.css:9-11 — «Legacy CSS variables — SOLO las que el código vivo consume ... No añadir aquí: lo nuevo va en styles/tokens.css» — EXACTO (el comentario abre en 8)
- Orden de carga verificado: src/styles/base.css:1 hace `@import './tokens.css'`, y App.css:2 importa base.css ANTES de declarar su propio `:root` en la línea 13 — el bloque legacy pisa a tokens.css, tal como dice su propio comentario en App.css:18-21
- src/components/Viewport3D/AvatarPanel.css:284 — `color: var(--color-success);` sin fallback — línea EXACTA
- AMBOS verdes están vivos: `var(--success)` (#22c55e) se consume 5× en PropertiesPanel.css (248, 252, 253, 317...); `var(--color-success)` (#10b981) se consume 1× en AvatarPanel.css:284. Dos paneles que María abre seguidos, dos verdes
- AMBOS ámbares vivos: `var(--warning)` (#f59e0b) 3× (PropertiesPanel.css:285, :386, base.css:16); `var(--color-warning)` (#cca700) 1× en copilot/connections/ConnectionCard.tsx:160
- src/styles/layout.css:39 — `background: #f5f3f0; /* Warm paper */` — línea EXACTA
- src/styles/tokens.css:29 — `--canvas-2d: #f1efe8;` — EXACTO. Consumidores: SOLO GridLayer.tsx:48 y RulerLayer.tsx:35 — EXACTO

> **Nota del verificador:** Confirmado el núcleo (dos registros, verde doble, ámbar doble, contrato escrito y bypasseado), pero REFUTO la subafirmación del papel: NO hay «costura visible de papel sobre papel». Tracé el árbol: `.canvas-area__2d` (layout.css:36) → `.pattern-editor` (PatternEditor.css:1, width/height 100%) → `<svg width="100%" height="100%">` (PatternEditor.tsx:815) → `<rect width="100%" height="100%" fill: var(--canvas-2d)>` (GridLayer.tsx:48). El único otro hijo, LeftDock, es `position: absolute` (Dock.css:4). El rect tapa el 100% del div: #f5f3f0 no se ve NUNCA. Es un valor muerto duplicado (deriva real), no una costura visible. Además encontré un tercer ámbar que el auditor no vio: ConnectionCard.tsx:160 escribe `var(--color-warning, #ca8a04)` — el fallback es un ámbar DISTINTO de los otros dos. Y ConnectionCard.tsx:177 / UnifiedBarChat.tsx:303,342 escriben `var(--color-error, #f87171)` cuando `--color-error` vale #ef4444: fallback que contradice al token existente.

## [ALTO] 8 nombres de token fantasma: declaraciones CSS que piden una variable que no existe en ningún registro y siempre caen al hex hardcodeado del fallback

- RECONTADO con grep sobre src/**/*.{css,ts,tsx}: CERO definiciones de los 8 nombres en TODO el repo (patrón `--(border-color|text-color|button-bg|accent-color|button-hover-bg|bg-hover|panel-section-bg|panel-border)\s*:` → «No matches found»)
- RECONTADO de usos: 62 ocurrencias en 7 archivos, no 59. Distribución exacta: BOMTab.css 20, NestingTab.css 13, GradingTab.css 13, AvatarPanel.css 10, LayerPanel.css 3 (= los 59 del auditor) MÁS 3 en .tsx que se le escaparon: ResolutionSection.tsx 2, AvatarPanel.tsx 1
- src/components/BottomPanel/BOMTab.css:25-27 — `background: var(--button-bg, #2a2a2a); color: var(--text-color, #ccc); border: 1px solid var(--border-color, #333);` — LÍNEAS EXACTAS, las tres fantasma
- src/components/LayerPanel/LayerPanel.css:4 — `background: var(--panel-section-bg, #2a2a3e)` vs src/components/LayerPanel/LayerPanel.css:10 — `background: var(--panel-section-bg, #1e1e3a)` — EXACTO. Mismo token inexistente, dos fallbacks distintos, en el mismo archivo, a 6 líneas de distancia
- src/components/Viewport3D/AvatarPanel.css:153 y :155 — `.ap-btn { border: 1px solid var(--border-color, #444); ... background: var(--bg-secondary, #2a2a2a); }` — EXACTO; y `--bg-secondary` SÍ existe valiendo #242424 (App.css:15), así que el fallback #2a2a2a es una mentira documental
- src/components/LayerPanel/LayerPanel.css:3 — `var(--panel-border, #2a2a3e)` — fantasma confirmado

> **Nota del verificador:** Confirmado y AMPLIADO: son 62 usos, no 59 — el auditor solo contó los .css y se dejó fuera 3 en .tsx. Cero definiciones en todo el repo, verificado con el patrón de declaración (no solo de uso). El caso LayerPanel.css:4 vs :10 es la prueba más limpia del lote y es literal. Añado un caso hermano que el auditor no listó y que cae bajo la misma regla: `var(--color-error, #f87171)` y `var(--accent, #4a9eff)` son fallbacks que contradicen tokens que SÍ existen — o sea, el problema no es solo «el token no existe», es «el fallback miente aunque el token exista». La regla propuesta (prohibir el fallback en var()) cubre ambos casos, así que se sostiene.

## [ALTO] Muchos materiales distintos para la misma idea de superficie flotante; cero tokens de sombra y el token de desenfoque casi sin usar

- CERO tokens de sombra confirmado: grep de `--shadow` sobre todo src/ → sin resultados. tokens.css:83-97 leído completo: define --radius-sm/md/lg/xl (84-87) y --blur (95), ninguna elevación
- Celdas verificadas al dígito, todas EXACTAS: Dock.css:3 `.dock` (--bg-surface / --radius-xl / 0 8px 32px .4 / --border / sin blur / z5) · Dock.css:127 `.dock-picker` (--bg-surface / --radius-md / z20) · unified-bar.css:3 `.unified-bar` (rgba(8,8,15,.78) / radio 29px / 0 4px 18px .22 / rgba(99,102,241,.15) / blur(16px) / z100) · unified-bar.css:142 `.unified-bar__panel` (rgba(8,8,15,.95) / 16px 16px 0 0 / blur(16px)) · floating.css:19 `.context-panel` (rgba(8,8,15,.95) / --radius-xl / SIN sombra / var(--blur) / z25) · floating.css:85 `.logo-menu` (rgba(8,8,15,.92) / 14px / blur16 / z200) · floating.css:159 `.logo-menu__submenu` (radio 12px / z210) · floating.css:178 `.context-menu` (14px / z1000) · SubMenu.css:17 `.submenu-panel` (12px / z1010) · LayerPanel.css:35 `.layer-context-menu` (#1e1e2e OPACO / 6px / #3a3a4e / z200) · LayerPanel.css:31 `.layer-color-popover` (#1e1e1e / 6px / #3a3a3a / z100) · ToastContainer.css:16 `.toast` (rgba(30,30,30,.92) / blur(12px)) · ToolTooltip.css:5 `.tool-tooltip` (#1a1a1a / 8px / #3a3a3a / z10000) · SnapshotBar.css:1 `.snapshot-bar` (rgba(30,30,30,.85) / 20px / blur(10px)) · SurfaceModePill.css:30 `.surface-pill__flyout` (rgba(30,30,30,.95) / 8px / z30) · CollisionBodyPanel.css:13 `.cb-panel` (rgba(30,30,30,.95) / radio 0) · RenderSettingsPanel.css:16 `.render-panel` (rgba(8,8,15,.95) / var(--blur)) · CalibrationModal.css:11 (#2a2a2a / 8px / #444 / z1000) · NotchPrecisionModal.css:5 (--bg-elevated / --radius-md / 0 8px 28px .45 / z1000) · ConnectionModal.tsx:45 `dialogStyle` (--bg-secondary / 8 / 0 16px 48px .5) · FloatingActionBar.tsx:66-79 (#1a1a1a / 6 / #333 / z90) · FitMapToggle.tsx:95,155,170,185 (S.toggleBar #2a2a2a·4, S.fitTable rgba(30,30,30,.92)·4, S.inspectTooltip rgba(0,0,0,.88)·3, S.configPanel rgba(30,30,30,.96)·4) · SimulationStatusOverlay.tsx:79-85 (rgba(0,0,0,.75) / 6 / blur(4px) / z100 / borde `${tier.color}33`)
- Los cuatro grupos incompatibles son reales y verificados: cristal indigo rgba(8,8,15,.92)+blur16+borde indigo (floating.css, SubMenu.css, unified-bar.css) / cristal gris rgba(30,30,30,.85-.96) (SnapshotBar, Toast, SurfaceModePill, cb-panel, FitMapToggle) / opaco tokenizado (Dock, NotchPrecisionModal) / opaco VS-Code #1a1a1a-#2a2a2a con bordes #333/#444 (ToolTooltip, CalibrationModal, FloatingActionBar, FitMapToggle)

> **Nota del verificador:** Confirmado el núcleo — la ausencia de token de sombra como causa raíz mecánica es real y verificada — pero corrijo TRES cuentas y descuento CUATRO celdas muertas. (1) Aritmética de sombras rota: el auditor dice «10 en .css + 6 en .tsx = 15», que ni suma 15 (son 16) ni deduplica. Recontado: 10 valores distintos en .css, de los cuales 2 no son elevación (`0 0 0 2px rgba(255,255,255,0.3)` es un anillo de foco y `inset 0 0 0 0.6px var(--accent-2d)` es un trazo del lienzo 2D); 6 en .tsx, de los cuales 2 duplican valores del .css. Recetas de elevación únicas reales: ~12, no 15. (2) El desenfoque «2 de 19» está inflado por los duplicados `-webkit-backdrop-filter`: contando solo declaraciones sin prefijo son 12 (blur16 ×6, blur12 ×1, blur10 ×1, blur8 ×1, blur4 ×1 en .tsx, var(--blur) ×2). El token se usa en 2 de 12, no de 19 — sigue siendo mal, pero di el número bueno. (3) CUATRO de las ~29 celdas de la tabla NO son superficies que María vea nunca: SolverMetrics.css (components/Debug/, y SolverMetrics.tsx:36-37 hace `if (!import.meta.env.DEV) return null` — dev-only, su z9999 está justificado); `.viewport3d-avatar-toggle` (AvatarPanel.css:317, cero consumidores en .tsx, CSS muerto); Viewport3D.tsx:980-996 el botón CB (gateado por `!hideChrome`, y AppShell.tsx:284 monta Viewport3D SIEMPRE con hideChrome → nunca renderiza); `.cb-panel` (su único opener es ese botón muerto → panel inalcanzable). Quitando esas, quedan ~25 materiales vivos, que sigue probando la tesis. El auditor tampoco dio la ruta de SolverMetrics.css (está en components/Debug/, no en Viewport3D/).

## [ALTO] Ocho azules de acento distintos; el valor de --accent se escribe literal en vez de usar el token

- src/styles/tokens.css:16 — `--accent: #6366f1;` — EXACTO, único acento del design system
- RECONTADO sobre src/**/*.{css,tsx,ts}: familia #4a9eff (hex + rgba(74,158,255)) = 56 ocurrencias en 22 archivos (auditor dijo ~55). Familia #6366f1 (hex + rgba(99,102,241)) = 41 en 13 archivos (auditor dijo 42), de las cuales 3 son las declaraciones legítimas en tokens.css:16,18,19 → 38 literales a mano
- Recuento de los demás: #007acc ×8 (auditor dijo 9), #0078d4 ×4 ✓, #60a5fa ×4 (dijo 3), #4a90d9 ×2 ✓, #4488ff ×2 ✓, #6aafff ×1 ✓
- src/components/Viewport3D/SnapshotBar.css:41-45 — `.snapshot-bar .snap-chip.active { background: rgba(74, 158, 255, 0.2); border-color: var(--accent); color: var(--accent); }` — RANGO EXACTO al dígito. Fondo azul VS-Code + borde y texto indigo en la MISMA regla
- src/components/PatternEditor/ReferenceImageSettings.css:18 — `color: var(--accent, #4a9eff);` — línea EXACTA
- src/components/Viewport3D/AvatarPanel.css:170-174 — `.ap-btn.accent { background: var(--accent, #007acc); border-color: var(--accent, #007acc); color: #fff; }` — RANGO EXACTO
- src/components/PatternEditor/CalibrationModal.css:75 — `.calibration-actions button.primary { background: #0078d4; }` — línea EXACTA (y :76 `border-color: #0078d4`)

> **Nota del verificador:** Confirmado. Las cifras del auditor están dentro de ±2 en todos los casos y él mismo las marcó con «~». SnapshotBar.css:41-45 es la prueba más limpia de todo el informe adversarial: tres propiedades, dos acentos, una sola regla, verificado literal. Dos matices que el auditor no vio y que AFINAN el hallazgo en vez de tumbarlo: (1) de los 41 usos de la familia #6366f1, 3 son las definiciones de tokens.css — los literales a mano son 38, no 42; (2) buena parte de los 56 usos de #4a9eff no está en el cromo oscuro sino en los renderers del lienzo 2D (ToolOverlay.tsx ×4, TransformHandlesOverlay.tsx ×6, PenToolOverlay.tsx ×3, LineToolOverlay, RectangleToolOverlay, MergeOverlay, EditPatternOverlay ×3). Eso no lo salva: el lienzo 2D TIENE su propio token de acento (`--accent-2d: oklch(0.66 0.16 248)`, tokens.css:35) declarado explícitamente «selection + seams only», y los overlays lo ignoran escribiendo el azul VS-Code encima del papel claro. Es la misma deriva en una segunda superficie. También descuento 3 de los 56 que están en archivos de test y 2 en datos (fabricCodes.ts, projectSlice.ts, colores de tela, no cromo).

## [MEDIO] El copia-pega real es CollisionBodyPanel → RenderSettingsPanel: nueve propiedades idénticas salvo el z-index, y dos paneles con contratos opuestos de tokenización

- src/components/Viewport3D/CollisionBodyPanel.css:1-11 — `.cb-panel-wrapper { position: absolute; top: 0; right: 0; width: 280px; height: 100%; display: flex; flex-direction: column; pointer-events: auto; z-index: 20; }` — BLOQUE EXACTO
- src/components/Viewport3D/RenderSettingsPanel.css:2-14 — `.render-panel-wrapper { ... }` con las MISMAS 9 propiedades en el MISMO orden, z-index: 30 — verificado línea por línea, el único cambio es el z
- src/components/Viewport3D/CollisionBodyPanel.css:39-47 — `.cb-panel-close { background: none; border: none; color: #888; font-size: 16px; cursor: pointer; padding: 2px 6px; }` + `:hover { color: #fff; }` — EXACTO
- src/components/Viewport3D/RenderSettingsPanel.css:45-53 — `.render-panel-close { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; }` + `:hover { color: var(--text-primary); }` — mismas 6 propiedades, mismo orden, solo los dos colores tokenizados. EXACTO
- El matiz del auditor VERIFICADO: AvatarPanel.css:26-33 `.avatar-panel-header` usa orden display/align-items/justify-content/padding/border-bottom/flex-shrink; CollisionBodyPanel.css:24-30 `.cb-panel-header` usa display/justify-content/align-items/padding/border-bottom SIN flex-shrink. Orden distinto + propiedad extra = linajes distintos, NO copia-pega entre sí
- src/components/Viewport3D/RenderSettingsPanel.css:17-19 — el archivo confiesa: «Superficie del design system (misma voz que ContextPanel) — el drawer traía el gris VS-Code de la era vieja (Fase 3, skin puerta-export)» — EXACTO

> **Nota del verificador:** Confirmado y es el hallazgo más honesto del lote porque MATIZA la hipótesis del dueño en vez de confirmársela cómodamente. El censo mecánico decía que avatar-panel y cb-panel «huelen a copia-pega literal» por compartir sufijos; el auditor abrió los dos archivos y demostró que NO — el orden de propiedades difiere y falta `flex-shrink`. El clon literal es cb→render, y ahí sí es literal. Único descuento: el gemelo `.cb-panel` está muerto (su opener está detrás de `!hideChrome`, AppShell monta Viewport3D siempre con hideChrome), así que hoy es duplicación de mantenimiento sobre una superficie que nadie ve — sigue siendo deuda que hay que mantener por duplicado, pero no hay dos épocas visibles conviviendo delante de María. MEDIO es la severidad correcta.

## [MEDIO] Dos menús contextuales, dos tooltips y dos modales con contratos opuestos: la misma idea implementada dos veces con materiales incompatibles

- src/styles/floating.css:175-177 — el comentario dice literal: «Same glass language as the logo menu — it used to be a flat VSCode-dark one-off (#1e1e1e) that clashed with every other floating surface.» — RANGO EXACTO
- src/styles/floating.css:178-198 — `.context-menu { position: fixed; z-index: 1000; background: rgba(8,8,15,0.92); backdrop-filter: blur(16px); border: 1px solid rgba(99,102,241,0.15); border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }` — EXACTO
- src/components/LayerPanel/LayerPanel.css:35 — `.layer-context-menu { position: fixed; background: #1e1e2e; border: 1px solid #3a3a4e; border-radius: 6px; padding: 4px 0; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,0.5); min-width: 140px; }` — LÍNEA EXACTA. El one-off que el comentario daba por muerto, vivo
- src/components/shared/SubMenu.css:1-3 — segundo comentario de la misma campaña: «this used to be a flat VSCode-dark one-off (#1e1e1e) that clashed with every other floating surface» — EXACTO
- src/components/shell/ToolTooltip.css:5-17 — `.tool-tooltip { position: fixed; z-index: 10000; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }` — RANGO EXACTO
- src/components/Viewport3D/FitMapToggle.tsx:170-183 — `inspectTooltip: { position: 'absolute', background: 'rgba(0,0,0,0.88)', borderRadius: 3, zIndex: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }` — contenido EXACTO (el auditor citó 171, la clave abre en 170)
- src/components/PatternEditor/CalibrationModal.css:1-19 — scrim `rgba(0,0,0,0.5)` z1000 (1-9) + caja `#2a2a2a` / `#444` / 8px / `#e0e0e0` / padding 20px / width 340px (11-19); y :75 botón primario `#0078d4` — TODO EXACTO
- src/components/PatternEditor/NotchPrecisionModal.css:1-4 comentario «deliberately no scrim/backdrop» + :5-18 caja `var(--bg-elevated)` / `var(--border)` / `var(--radius-md)` / `0 8px 28px rgba(0,0,0,0.45)` / z1000 / padding 20px / width 320px — TODO EXACTO
- AMBOS menús son alcanzables por María y en la misma sesión: `.context-menu` se usa en PatternEditor/ContextMenu.tsx:148 (clic derecho en el lienzo) y `.layer-context-menu` en LayerPanel/LayerPanel.tsx:389 (LayerPanel se hospeda como «Capas» en ContextPanel)
- Ambos modales alcanzables: CalibrationModal montado desde PatternEditor.tsx:782, NotchPrecisionModal desde PatternEditor.tsx:1077
- src/components/Viewport3D/FitMapToggle.tsx:93-198 — objeto `const S = {...}` con toggleBar(95), scaleBar(140), fitTable(155), inspectTooltip(170), configPanel(185), ninguna tokenizada

> **Nota del verificador:** Confirmado, y la evidencia de la campaña abandonada es la parte más fuerte: dos comentarios distintos (floating.css:175-177 y SubMenu.css:1-3) presumen de haber matado un one-off #1e1e1e que sigue vivo a 6 caracteres de distancia en LayerPanel.css:35 (#1e1e2e). Verifiqué que los dos menús son alcanzables en la misma sesión, así que la escena que describe (clic derecho en el lienzo vs clic derecho en una capa) es real. Dos correcciones menores: (1) las claves de `S` en FitMapToggle abren una línea antes de las que cita el auditor (95/155/170/185, no 96/156/171/186) — citó consistentemente la línea `position:` en vez de la clave; (2) la afirmación «radios 2/3/4 que no existen en ninguna otra parte de la app» es FALSA: el censo mecánico del propio encargo dice 4px ×25 y 3px ×18 en el repo, y yo verifiqué 3px en BOMTab.css:28 y RenderSettingsPanel.css:102. Los radios de FitMapToggle no son exóticos, son parte del mismo pantano — lo que no cambia la tesis. `scaleBar` tampoco es una superficie flotante (solo borde y radio, sin fondo ni sombra): son 4 superficies en el objeto S, no 5.

## [MEDIO] Cinco convenciones de nombres conviviendo sobre 373 clases, incluido un namespace genérico sin prefijo

- RECONTADO: 373 clases distintas de primer nivel en src/**/*.css — coincide EXACTO con el censo del encargo. 115 contienen `__` o `--` → 258 kebab plano. Aritmética consistente
- BEM canónico verificado: `.context-panel__header` (floating.css:44) y `.context-panel--right` (floating.css:35), `.dock__tool--active` (Dock.css), `.unified-bar__mode-btn--active` (unified-bar.css), `.surface-pill__flyout` (SurfaceModePill.css:30), `.toast__dismiss` (ToastContainer.css)
- Kebab plano verificado: `.cb-panel-header` (CollisionBodyPanel.css:24), `.cb-panel-close` (:39), `.cb-panel-scroll` (:49), `.render-panel-header` (RenderSettingsPanel.css:30), `.layer-group-header` (LayerPanel.css:10)
- Híbrido kebab+modificador BEM verificado: `.tool-tooltip-desc--pin` (ToolTooltip.css:74, línea EXACTA), `.solver-metrics-dot--active` (components/Debug/SolverMetrics.css:40), `.solver-metrics-section--error` (SolverMetrics.css:86), `.seam-connection--selected` (PatternEditor/PatternEditor.css:40)
- Prefijos abreviados privados: `ap-` = 20 clases EXACTO (AvatarPanel.css); `cb-` = 14, no 8; `ref-img-` = 15, no 13
- Namespace genérico verificado: PropertiesPanel.css declara 36 clases `.panel-*` distintas (.panel-section, .panel-title, .panel-input, .panel-btn-sm, .panel-chip-btn, .panel-hint, .panel-delete, .panel-field, .panel-slider, .panel-link-row, .panel-tension-tag...) — recontado, son 36 no ~30
- components/ErrorBoundary/ErrorBoundary.css declara `.panel-error-boundary` (:3), `.panel-error-icon` (:15), `.panel-error-title` (:20), `.panel-error-message` (:26), `.panel-error-reset` (:34) — mismo prefijo `panel-`, otro archivo, CSS global sin módulos

> **Nota del verificador:** Confirmado. Los 373/115/258 los reconté yo y cuadran al dígito con el censo mecánico del encargo; los cuatro ejemplos de la tercera convención (híbrida) existen todos y los abrí uno por uno. Dos correcciones de conteo, ambas a favor del auditor: `cb-` son 14 clases no 8, `ref-img-` son 15 no 13, y `.panel-*` de PropertiesPanel son 36 no ~30 — subestimó. Una precisión importante sobre el `.panel-*`: HOY no hay colisión real. Grepeé `.panel-section|.panel-title|.panel-input|.panel-hint` en .tsx fuera de PropertiesPanel y el resultado es cero, y las clases `.panel-error-*` de ErrorBoundary no chocan con ninguna de las 36 (son nombres distintos que solo comparten prefijo). Es riesgo futuro, no defecto presente — el auditor lo dijo honestamente («bomba de retardo»), así que no es exageración, pero conviene que el dueño sepa que ese cañón no ha disparado todavía. Y sobre la severidad: MEDIO está bien; esto no rompe nada hoy, es el mecanismo que PRODUCE los otros hallazgos (si no puedes deducir el nombre siguiente, abres el archivo vecino y copias).

## [BLOQUEANTE] El glosario de copy existe desde 2026-07-16 y su regla dura se rompe dentro de un mismo componente de 98 líneas

- docs/specs/2026-07-16-ui-copy-es-glosario.md líneas 6-7: «Regla dura: cero mezcla de idiomas dentro de una misma superficie» — EXACTO.
- HintText.tsx:34 `Editing nodes — Drag to move · Esc to exit` — EXACTO.
- HintText.tsx:79 `Click a piece to apply ${saDefaultWidthMm ?? DEFAULT_SEAM_ALLOWANCE}mm · drag across pieces to apply to all · click an edge for its width · a corner for corner type` — EXACTO.
- HintText.tsx:50 'Clic cose el lado entero · arrastre cose solo un tramo' — EXACTO.
- git log -L34,34 = 25c833e4 2026-02-19; -L79,79 = af0a6b0b 2026-06-09; -L50,50 = 6df5d5a1 2026-08-12. Los tres hashes y las tres fechas VERIFICADOS. Los tres <text> están en x=50% y=98% (líneas 28-29, 46, 77): mismo elemento visual.
- El log de -L50 muestra además que aa101288 (2026-07-16, «canvas 2D en español (Fase 3)») tradujo esa línea el mismo día del glosario y no tocó ni la 34 ni la 79. La ráfaga de traducción existió y dejó dos hermanas en inglés en el mismo archivo.
- grep 'i18n|useTranslation' en src/ da 1 hit y es un comentario en src/utils/seamly2d/measurementNameTranslation.ts:11 que dice explícitamente que NO es un proyecto de i18n. La afirmación «0 resultados» es casi exacta y el matiz la refuerza.
- ReferenceImageSettings.tsx:60 'Importar imagen de referencia' / :63 'Import Image' / :78 'Hide':'Show' / :92 'Calibrate scale' / :99 'Remove image' / :107 'Opacity' — LAS SEIS EXACTAS.
- src/components/shell/dxfImport.ts:1-9 cabecera que justifica su ubicación; :24-41 dxfErrorMessage mapea códigos tipados a español. El contraejemplo del auditor es REAL y exacto.

> **Nota del verificador:** Corrección de citas: en DockToolPicker.tsx el aria-label español está en :20 (no :19) y el de Quitar/Añadir en :35 (no :38). Las dos cadenas inglesas sí están donde dice (:21 'Dock tools', :46 'Reset to defaults'). Contenido intacto, numeración corrida 1-3 líneas. BLOQUEANTE se sostiene sobre todo por HintText:79: es la instrucción operativa de la herramienta de margen de costura, 100% en inglés.

## [BLOQUEANTE] El Inspector completo —43 cadenas— habla inglés técnico dentro de un marco en español

- Recuento propio: grep -c 'message:' en ruleEngine.ts = 18; grep -c 'detail:' = 15. 18+15=33, +10 de agentAnalyzer = 43. LA CIFRA ES EXACTA.
- ruleEngine.ts:34 'No fabric assigned' / :35 'A fabric must be assigned before the piece can be simulated or exported.' — EXACTAS.
- ruleEngine.ts:143 'Body penetration detected (collision distance: …)' EXACTA; :184 'Piece has not been simulated (particle count is 0)' EXACTA; :220 '${count} construction point(s) failed to resolve' EXACTA; :331 TINY_PIECE_MESSAGE_PREFIX = 'Orphaned tiny piece detected' EXACTA.
- Revisé las 33 líneas de ruleEngine una por una: no hay ni una sola en español.
- agentAnalyzer.ts:15/16, 30/31, 38/39, 45/46, 54/55 — LAS DIEZ EXACTAS, sin desvío de línea.
- InspectorTab.tsx:51 'Clic derecho en una pieza y elige Inspeccionar para empezar' EXACTA; :132 'Datos crudos' EXACTA; :135 'Pieza' EXACTA. Además :137-139 'posición/rotación/margen de costura' y :143 'Borde', que el auditor no citó y refuerzan el marco español.
- InspectorTab.tsx:29-35: botón 'Aplicar' disabled con title='Próximamente — se aplicará automáticamente vía el copiloto' — EXACTO. Es efectivamente el único botón del panel.

> **Nota del verificador:** Numeración corrida en InspectorTab (el archivo va +1/+2 respecto a lo citado): {diag.message} en :98 (no :96), {diag.detail} en :101 (no :100), description/impact en :25/:26 (no :24/:25), 'problema(s)' en :79, 'Analizando…' en :112, inspector-agent-error en :115. Ninguna cita inventada; todas existen desplazadas. La tesis del panel bilingüe con la costura justo en la frontera motor/UI queda CONFIRMADA.

## [BLOQUEANTE] Existe un campo nameEs con traducciones escritas, obligatorio en el tipo, y lo consume el copiloto en vez de la UI

- src/types/trim.ts:31 `nameEs: string;` sin `?` — EXACTO. El tipo exige la traducción para todo avío.
- physicalFabric.ts:119 name:'Cotton Poplin' / :120 nameEs:'Popelina de Algodón' — EXACTO.
- trimLibrary.ts:6 { id:'button-flat-15mm', name:'Flat Button 15mm', nameEs:'Botón Plano 15mm', … } — EXACTO. 21 ocurrencias confirmadas.
- Grep exhaustivo de consumidores: fabricTools.ts:30, trimTools.ts:339, blueprintTools.ts:31/101 — TODOS en src/copilot/. Cero .tsx. «CERO componentes React» es CORRECTO.
- MaterialTab.tsx:101 `{f.name.split(' ').slice(0, 2).join(' ')}` EXACTO; :99 title con ${f.weaveType} enum crudo EXACTO ('plain','knit-jersey','knit-interlock' verificados en el archivo).
- physicalFabric.ts:325 name:'Lycra/Spandex (4-way stretch)' EXACTO. La truncación de MaterialTab:101 produce «Lycra/Spandex (4-way», paréntesis sin cerrar. BUG REAL, reproducible por lectura.
- bomExtractor.ts:180 / :215 / :260 / :302 / :346 — LAS CINCO EXACTAS, al número.
- trimExtractor.ts:97 y :113 name:`${g.type} — ${g.name}` — EXACTAS. Confirma la fila «button — Flat Button 15mm».
- BOMTab.tsx:57-66 CATEGORY_LABELS en español — EXACTO.
- CITA QUE EL AUDITOR NO ENCONTRÓ y que cierra el caso: BOMTab.tsx:331 `value={entry.resolvedName}` renderiza el nombre crudo, y techPackPdf.ts:390 mete `entry.resolvedName` en el PDF de la ficha técnica. El entregable en inglés está probado de punta a punta.

> **Nota del verificador:** Dos correcciones numéricas. (1) physicalFabric.ts tiene 32 traducciones de tela, no 33: grep -c da 34 pero dos hits no son entradas (:55 es la declaración del tipo, :886 un uso). Total real = 32+21 = 53, no 54. (2) El comentario de la convención está en BOMTab.tsx:68, no :69 (:69 es `const UNIT_LABELS`). Hay además un TERCER consumidor que el auditor no vio: physicalFabric.ts:886, dentro de searchPhysicalFabrics — pero es búsqueda, no display, así que no debilita nada: refuerza que nameEs se usa para MATCHEAR en todas partes y para MOSTRAR en ninguna.

## [ALTO] Los nombres de borde son identificadores camelCase en inglés y se imprimen crudos en tres superficies

- semanticEdges.ts:126-202 — el rango es correcto y el vocabulario existe donde dice.
- semanticEdges.ts:207 `const finalName = existing.length > 0 ? \`${name}-${existing.length + 1}\` : name;` — EXACTO. Confirma «sideSeam-2».
- autoSew/edgeExtractor.ts:135 `name: 'edge-0'` — EXACTO.
- EdgePropertiesSection.tsx:210 `const subtitle = count === 1 ? \`Borde · ${resolved[0].edgeName}\` : \`${count} bordes\`;` — EXACTO. María lee «Borde · underarmSeam».
- ruleEngine.ts:235 `Seam "${seam.edgeName}" → ${seam.partnerPieceName}: extreme gathering (${seam.tension}%)` — EXACTO.
- geometry/edgeInterpolation.ts:14 `const edge = piece.edges?.find(e => e.name === edgeName);` — EXACTO. Es el corazón del hallazgo: el mismo string es índice y etiqueta.
- bodiceSkill.ts:186 'Marcar profundidad de sisa desde la nuca' y :208 'Dar forma a la curva de sisa trasera desde el hombro hasta la costura lateral' — EXACTAS. La traducción del oficio SÍ existe en el repo, en la capa del copiloto.

> **Nota del verificador:** El auditor SUBESTIMÓ el problema: dice «las 16 entradas de semanticEdges.ts:126-202» y el vocabulario real son 22 nombres. Faltan en su lista 'shoulder' (:133), 'sleeveCap' (:150), 'collarEnd' (:169), 'crotchCurve' (:185), 'waistbandFold' (:193) y 'waistbandEnd' (:195). Cualquier EDGE_LABELS_ES arranca con 22, no 16. Única cita corrida: inspector-edge-name está en InspectorTab.tsx:70, no :68.

## [ALTO] La barra superior imprime el enum crudo del solver aunque el mapa de etiquetas existe a un import de distancia

- TopBar.tsx:78 `<span>{solverTier ?? 'idle'}</span>` — EXACTO.
- simulationSlice.ts:30 `export type SolverTier = 'none' | 'webgpu' | 'wasm' | 'cpu-worker' | 'neural-drape';` EXACTO; :224 `solverTier: 'none' as SolverTier,` EXACTO.
- PRUEBA DE CÓDIGO MUERTO, verificada por mí: simulationSlice.ts:101 declara `solverTier: SolverTier` sin `| null`, y el único punto de escritura es :340 `state.solverTier = action.payload`, tipado. El `?? 'idle'` NUNCA puede dispararse: en la barra se lee literalmente «none». CONFIRMADO.
- SimulationStatusOverlay.tsx:33-39 TIER_INFO con 'En reposo'/'WebGPU'/'Wasm XPBD'/'CPU Worker'/'Neural Drape' — EXACTO (el bloque llega a :39; el auditor dijo :33-38).
- TopBar.tsx:80 `{pieces.length > 0 && <span>· {pieces.length}p</span>}` EXACTO; :79 `· {formatCount(particleCount)}` EXACTO.
- TopBar.tsx:76-81: el div .top-bar__status no tiene title ni aria-label — verificado leyendo el bloque completo.
- styles/layout.css:21-28 `.top-bar__status { … font-family: var(--font-mono); }` — EXACTO.
- TopBar se monta en AppShell.tsx:215: la superficie está viva, no es código huérfano.

> **Nota del verificador:** Todas las citas exactas, sin una sola línea corrida — es el hallazgo mejor sustentado del lote junto al 10. Añado una cita que el auditor no vio y que empeora su punto: TopBar.tsx:27 `const formatCount = (n) => n >= 1000 ? \`${(n / 1000).toFixed(1)}k\` : String(n)` usa punto decimal anglosajón, así que en un producto en español la barra dice «12.4k», no «12,4k». Misma raíz: un readout escrito para desarrolladores.

## [ALTO] El overlay 3D de producción cita RFCs internos, claves de localStorage y jerga de solver a la patronista

- SimulationStatusOverlay.tsx:63 `if (simulationState === 'idle' && !toolUnsupported) return null;` — el gate es de estado; NO hay `import.meta.env.DEV` en ninguna parte del archivo. Es producción. CONFIRMADO (el auditor dijo :64).
- SolverMetrics sí está gateado: src/components/Debug/SolverMetrics.tsx:36 `if (!import.meta.env.DEV) {` — el contraejemplo es real y la línea exacta (la ruta correcta es Debug/, no Viewport3D/).
- :123 `🧵 {seamResolution.totalConstraints.toLocaleString()} constraints de costura` — EXACTA (auditor dijo :122).
- :128-133 el title con 'Parity plan Fase 4' y `${z.seamId} (${z.reason})` — EXACTO; z.seamId son UUIDs sin resolver a nombre de pieza.
- :139 `Modo: {simulationMode}{isMobile ? ' · móvil' : ''}` — EXACTA, enum crudo.
- :158 title='El tier WASM no soporta LRA (long range attachments)… Cambia al tier CPU para paridad completa. Ver RFC A7.' — EXACTA AL NÚMERO.
- :168 '…si lo desactivaste, limpia localStorage(vina-use-webgpu). Ver RFC C4 § 2.3.' — EXACTA en contenido (auditor dijo :171). :148 face-poke y :160 '⚠️ Funciones limitadas (…usa el tier CPU)' — EXACTAS en contenido (auditor dijo :147 y :163).
- Glosario regla 4 verificada literal al pie del spec.

> **Nota del verificador:** Contexto atenuante que el auditor NO vio y que debería estar en el hallazgo: el overlay arranca COLAPSADO (useState(false), :42) y todas las cadenas con RFC/localStorage viven en atributos `title` dentro del bloque {expanded && …} (:113-175). Llegar a ellas exige expandir y luego hacer hover. La cabecera del archivo (:7-10) documenta el colapso como decisión deliberada del mismo plan 2026-07-16 que el glosario: «debug chrome fuera de la posición primaria de lectura». La exposición real es bastante menor de lo que sugiere el hallazgo. Lo que sí es texto visible (una vez expandido, sin hover) es :160 y :172 — y :160 es justo el que ordena «usa el tier CPU» sin que exista selector de tier. Ese sub-hallazgo aguanta ALTO; el de los RFC en tooltips lo bajaría a MEDIO.

## [ALTO] Cinco formatos distintos para un atajo de teclado, con helper canónico ignorado por tres superficies y duplicado que transforma al revés

- shortcutDisplay.ts:10-16 displayShortcut() con .replace(/⌘/g,'Ctrl+') etc. — EXACTO, y su cabecera :1-5 declara la regla.
- Consumidores verificados por grep completo: LogoMenu.tsx:23 + :225, UnifiedBar.tsx:8 + :267, UnifiedBarCommands.tsx:5 + :71. Solo esos tres. EXACTO.
- ToolTooltip.tsx:85-92 `function formatShortcut(s)` con .replace('ctrl+','⌘').replace('shift+','⇧').replace('alt+','⌥').toUpperCase() — EXACTO AL NÚMERO. Transforma en dirección CONTRARIA al canónico.
- ToolTooltip.tsx:69 `<kbd className="tool-tooltip-shortcut">{formatShortcut(shortcut)}</kbd>` — el duplicado sí se ejecuta.
- Dock.tsx:42 `<ToolTooltip … shortcut={tool.shortcut} …>` EXACTO. FloatingActionBar.tsx:86 `<ToolTooltip key={def.id} name={label} shortcut={def.shortcut}>` EXACTO (ruta real src/components/PatternEditor/, no shell/).
- TopBar.tsx:43 title='Deshacer (⌘Z)' y :53 title='Rehacer (⌘⇧Z)' — EXACTAS, glifos mac hardcodeados sin helper.
- DockToolPicker.tsx:39 `<kbd className="dock-picker__kbd">{tool.shortcut}</kbd>` — EXACTO, crudo.
- ContextMenu.tsx:170 `{def.shortcut}` crudo EXACTO. actionCuration.ts:152 'Ctrl+C', :166 'Ctrl+B', :259 'F2', :294 'Del' — LAS CUATRO EXACTAS. LogoMenu.tsx:60 '⌘Z' — EXACTA.

> **Nota del verificador:** Todas las citas exactas. Añado dos agravantes que el auditor no vio. (1) formatShortcut usa .replace('ctrl+', …) en minúscula y case-sensitive, mientras actionCuration declara 'Ctrl+C' con C mayúscula: el reemplazo NO matchea y el .toUpperCase() final deja «CTRL+C» en el tooltip de la FloatingActionBar frente a «Ctrl+C» en el menú contextual — un sexto formato del mismo string. (2) RightDock.tsx:80 pasa shortcut='espacio', que el mismo helper convierte en «ESPACIO». El helper duplicado no solo invierte: rompe sus propios casos.

## [ALTO] Tres error boundaries con tres microcopys, dos idiomas, y los tres filtran error.message crudo

- AppErrorBoundary.tsx:46 'Algo salió mal' y :48 `{this.state.errorMessage || 'Un error inesperado tumbó la aplicación.'}` — contenido EXACTO (citadas como :44/:46, corridas +2).
- PRUEBA de que el message crudo llega al DOM: AppErrorBoundary.tsx:20 `return { hasError: true, errorMessage: error.message };` y SimulationErrorBoundary.tsx:24 idéntico. CONFIRMADO — no es inferencia, es el getDerivedStateFromError.
- PanelErrorBoundary.tsx:36 `Error en {this.props.panelName}`, :38 'Un error inesperado ocurrió en este panel.', :41 'Reiniciar el panel' — LAS TRES EXACTAS.
- SimulationErrorBoundary.tsx:46 '3D Viewport Error', :49 'An error occurred in the 3D rendering engine.', :58 'Reset Viewport' — LAS TRES EXACTAS. Inglés completo.
- SimulationErrorBoundary.tsx:39-59 estilos inline con #e0d8cc y #1a1a1a (:42), #555 y #2a2a2a (:54-55) — EXACTOS. Los otros dos importan './ErrorBoundary.css' (AppErrorBoundary.tsx:4, PanelErrorBoundary.tsx:2) y el archivo existe. La divergencia doble copy+estilo es REAL.
- reactiveSolverMiddleware.ts:503 `storeDispatch(showErrorToast(\`Error de construcción: ${error}\`) as AnyAction);` EXACTA. workerPool.ts:146 `new Error('Worker initialization timeout')` EXACTA: la cadena del worker sí puede terminar en el toast.
- uiExport.ts:48 `showErrorToast(\`No pude exportar ${ERR_NOUN[format]}: ${(err as Error).message}\`)` — EXACTA.
- InspectorTab.tsx:115 `<div className="inspector-agent-error">⚠ {agentError}</div>` — EXACTA en contenido (auditor dijo :117).
- AppErrorBoundary.tsx:60-62 botón 'Recargar la aplicación' — confirmado: ese sí nombra el resultado, como dice el auditor.

> **Nota del verificador:** Solo dos citas corridas (+2 en AppErrorBoundary, +2 en InspectorTab); todo lo demás exacto. El contraste con dxfImport.ts:24-41 como patrón ya resuelto lo verifiqué línea por línea y es correcto, incluida la cabecera que justifica su ubicación.

## [MEDIO] Tabla de sinónimos: seis conceptos con dos o tres nombres, incluida una unificación que el propio glosario ordenó y nadie ejecutó

- unifiedBarCommandDefs.ts:63 description:'Exporta el patrón como DXF' — EXACTA (patrón = documento).
- actionCuration.ts:243 label 'Seleccionar patrón vinculado' y :244 `run: (ctx) => ctx.dispatch(selectPiece(ctx.piece!.linkedPieceId!))` — EXACTAS. El verbo despacha selectPiece: patrón = pieza. La colisión semántica es REAL.
- dock2dTools.ts:24 { id:'editPattern', label:'Editar patrón', shortcut:'Q' } EXACTA; useEditPattern.ts:2 «Edit Pattern (Q) hook» y :4 «Manages point/segment selection» EXACTAS: edita puntos de UNA pieza.
- HintText.tsx:50 'lado entero'/'tramo', :57 'Clic en un lado…', :63 'Clic en un borde…', :85 'Clic en un borde para recorrer la costura' — LAS CUATRO EXACTAS. «lado» y «borde» conviven en el mismo componente.
- EdgePropertiesSection.tsx:210 'Borde · ${edgeName}', :87 'Tramo {suffix}', :248 'Tramos del margen' — LAS TRES EXACTAS. El doble sentido de «tramo» está confirmado.
- LogoMenu.tsx:113 'Coser piezas automáticamente' EXACTA. autoSewThunk.ts:85 'Auto-sew: N costura(s) propuesta(s)', :88 'Auto-sew: las costuras propuestas ya existen', :91 'Auto-sew: sin costuras con confianza suficiente' — LAS TRES EXACTAS.
- El glosario ordena la unificación en su fila «Auto-Sew | Coser automáticamente» — verificado literal en el spec.
- dock2dTools.ts:28 label 'Punto' vs HintText.tsx:34 'Editing nodes' — EXACTAS.
- Contraejemplos consistentes: dock2dTools.ts:37 'Piquete', :38 'Margen de costura', actionCuration.ts:143 'Eliminar pinza', PieceProperties.tsx:72 'Margen (mm)' — TODAS EXACTAS.

> **Nota del verificador:** El hallazgo se sostiene, pero le arranqué la narrativa: ver el punto refutado sobre «la ráfaga siguiente tocó autoSewThunk.ts para añadir Re-coser». Además 'Re-coser' está en autoSewThunk.ts:128 y :137, y 'Re-cosido' en :153 — no en :127 y :152.

## [MEDIO] Capitalización sin fuente única: el CSS ya grita y cuatro llamadas mandan el literal también en mayúsculas

- PropertiesPanel.css:46-52 `.panel-title { … letter-spacing: 0.08em; text-transform: uppercase; … }` — EXACTO AL NÚMERO.
- ESLABÓN QUE EL AUDITOR NO CITÓ Y QUE ES EL QUE CIERRA EL HALLAZGO: PropertySection.tsx:19 `<span className="panel-title">{title}</span>`. Sin esa línea la premisa «el CSS ya grita sobre estos títulos» sería indemostrable; con ella, la doble fuente está PROBADA.
- PieceProperties.tsx:59 title='PIEZA', :298 title='CAPA', :325 title='SIMULACIÓN' — LAS TRES EXACTAS.
- PropertiesPanel.tsx:141 title='MATERIAL' y :75 title={`COSTURAS (${seams.length})`} — EXACTAS.
- SeamPropertiesPanel.tsx:115 title={`COSTURA: ${pieceAName} ↔ ${pieceBName}`} — EXACTA.
- Sentence case en el resto: EdgePropertiesSection.tsx:248 'Tramos del margen', MaterialTab.tsx:92 'Preset de tela', PieceProperties.tsx:218 'Reglas de colocación', VertexPropertiesSection.tsx:46 'Esquina' — LAS CUATRO EXACTAS.
- Viewport3D.tsx:1013 '● MODO POSE' / '⊕ COLOCAR — clic en la pieza, luego clic en el punto de colocación' / '✏️ MODO EDICIÓN' en una sola línea con la frase en minúscula — EXACTA.
- RenderQualitySection.tsx:28 'Tone Mapping' EXACTA; CollisionBodyPanel.tsx:63 'Collision Bodies' EXACTA.
- Glosario regla 5 «sin title case en body copy» — verificada literal.

> **Nota del verificador:** Confirmado en lo estructural, con una frase suya refutada aparte («el SeamPropertiesPanel ya demuestra el problema hoy»). El defecto es de fragilidad y doble fuente de verdad, no un defecto visible en la pantalla actual — que es exactamente lo que corresponde a MEDIO, así que la severidad está bien puesta aunque el argumento de apoyo estuviera mal.

## [MEDIO] Los aria-label de las dos superficies universales están en inglés, contra la regla 3 explícita del glosario; y el documento se declara en inglés

- Glosario regla 3 verificada literal: «Los aria-label también van en español (los lee el screen reader de María, no el test runner)».
- ToastContainer.tsx:58 aria-label='Dismiss notification' — EXACTA.
- ContextPanel.tsx:45 `<button className="icon-btn" onClick={onClose} aria-label="Close panel">` — EXACTA, literal completa.
- index.html:2 `<html lang="en">` — EXACTA.
- Los tres cierres de panel con tres contratos: ContextPanel.tsx:45 (icon-btn + aria inglés, sin title), CollisionBodyPanel.tsx:64 `<button className="cb-panel-close" onClick={onClose}>&times;</button>` (sin aria NI title), RenderSettingsPanel.tsx:38 `<button className="render-panel-close" onClick={onClose} title="Cerrar">&times;</button>` (title sin aria) — LAS TRES EXACTAS al número y al contenido.
- Los OCHO contraejemplos verificados uno por uno: LeftDock.tsx:82 'Personalizar herramientas del dock'; RightDock.tsx:64 'Colocar', :74 'Coser', :85 'Simular', :96 'Avatar'; NotchPrecisionModal.tsx:67 'Colocación de piquete'; SurfaceModePill.tsx:71/:78/:83; FitMapToggle.tsx:331 'Tensión mín' y :428 'Distancia de presión'; NestingTab.tsx:315 'Ancho de rollo personalizado en milímetros' y :329 'Separación entre piezas en milímetros'. TODAS EXACTAS.

> **Nota del verificador:** El hallazgo mejor citado del lote: no encontré una sola línea desviada, ni en las infracciones ni en los ocho contraejemplos. Que la regla se cumpla en ocho archivos y falle justo en los dos omnipresentes es un hecho verificado, no retórica.

## [MEDIO] El panel de cuerpos de colisión es 100% inglés y su botón de acceso se llama «CB»; piezas nuevas nacen llamándose «Poly Pen Piece»

- CollisionBodyPanel.tsx:63 'Collision Bodies', :84 '+ Import Collision Body (.obj .fbx .glb .gltf)', :125 'Hide'/'Show', :132 'Disable collision'/'Enable collision', :139 'Delete', :150 'Friction', :160 'Offset' — LAS SIETE LÍNEAS EXACTAS AL NÚMERO. Nueve cadenas distintas, cero en español: recuento CORRECTO.
- Viewport3D.tsx:994 title='Collision Bodies' y :997 el contenido literal del botón es `CB` — EXACTAS.
- usePolyPenTool.ts:67 `name: 'Poly Pen Piece',` — EXACTA.
- PERSISTENCIA VERIFICADA (el auditor la afirmó sin probarla): PatternEditor.tsx:175-184 handlePieceComplete solo añade id/createdAt/updatedAt y despacha addPiece — NO sobrescribe el nombre. La cadena entra al proyecto tal cual.
- LogoMenu.tsx:89 'Nombres de pieza' — EXACTA: el toggle que la pone en el lienzo existe.
- MaterialTab.tsx:101 sobre physicalFabric.ts:325 produce «Lycra/Spandex (4-way» — verificado en el hallazgo 3.
- actionCuration.ts:215/216/217 'Superponer encima/debajo/al lado...' con puntos ASCII contra :259 'Renombrar…', :277 'Ajustar distancia…', :284 'Ancho exacto…' con U+2026 — LAS SEIS EXACTAS. Dos convenciones de elipsis en el mismo archivo, CONFIRMADO.
- ToolTooltip.tsx:76 `<div className="tool-tooltip-hint">Hold to see variants</div>` — EXACTA. Alcance verificado por grep: ToolTooltip envuelve Dock.tsx:42, DockAutoZone.tsx:42, RightDock.tsx:59/69/80/91 y FloatingActionBar.tsx:86.

> **Nota del verificador:** Confirmado y AGRAVADO. El auditor encontró un tercio del problema de nomenclatura: no es una herramienta, son tres, cada una con su propio esquema inglés. usePenTool.ts:132 y :192 emiten `Piece ${Date.now().toString(36)}` y useRectangleTool.ts:82 emite `Rect ${Date.now().toString(36)}`. Tres herramientas de dibujo, tres convenciones de nombre, ninguna coincide con las etiquetas españolas que el mismo dock ya tiene en DOCK_2D_CATALOG ('Pluma', 'Rectángulo'). Su regla de contrato propuesta cubre las tres sin cambios.

## [ALTO] 7 diálogos nativos bloqueantes (confirm/alert/prompt) coexisten con el sistema de Toast ratificado

- D:\Desktop\projects\vina\src\components\shell\LogoMenu.tsx:43 — EXACTO. `if (confirm('¿Crear un proyecto nuevo? Los cambios sin guardar se pierden.'))` seguido de `void clearStorageProject().finally(() => window.location.reload());` en :44.
- D:\Desktop\projects\vina\src\components\shell\LogoMenu.tsx:133 — EXACTO. `alert('Vina v0.11.0\nMotor de diseño cognitivo para ingeniería de moda')`.
- D:\Desktop\projects\vina\src\components\Viewport3D\AvatarPanel.tsx:139 — EXACTO. `const name = prompt('Nombre del perfil:');` y :140 `if (!name) return;`.
- D:\Desktop\projects\vina\src\components\Viewport3D\AvatarPanel.tsx:159 — EXACTO. `if (!confirm('¿Eliminar este perfil?')) return;`
- D:\Desktop\projects\vina\src\components\Viewport3D\AvatarPanel.tsx:348 y :382 — EXACTOS ambos.
- D:\Desktop\projects\vina\src\copilot\connections\ConnectionsList.tsx:127 — EXACTO.
- Grep exhaustivo de confirm(/alert(/prompt( en src/ (sin tests) devuelve 8 hits: los 7 citados + memoryTools.ts:39. El inventario del auditor es completo, no le faltó ninguno.
- D:\Desktop\projects\vina\src\store\copilotUISlice.ts:403 — EXACTO. `export function showUndoToast(...)`. Grep confirma UN solo call site vivo: PatternEditor.tsx:250 (margen de costura).
- D:\Desktop\projects\vina\src\copilot\action\tools\definitions\memoryTools.ts:38-39 — EXACTO, y el comentario de :30-36 documenta la excepción explícitamente («El diálogo de confirmación de Redux es una superficie oscura»). El auditor la excluyó bien.
- AvatarPanel.tsx:114 (que el auditor NO citó y refuerza el hallazgo): `if (!supported.includes(ext)) return;` — subir un archivo con extensión no soportada tampoco produce toast ni mensaje. Segundo no-op silencioso en la misma ruta.

> **Nota del verificador:** Todas las citas existen y dicen lo que el auditor afirma. Le BAJO la severidad de BLOQUEANTE a ALTO: el modo de fallo que sostiene «BLOQUEANTE» (Chrome/Firefox suprimen diálogos → prompt devuelve null) exige que María marque una casilla del navegador primero; no es el estado por defecto. Sin esa casilla nada se rompe hoy, así que es deriva sistémica (ALTO), no rotura de uso real. Dos correcciones menores: los dispatches de showToast/showErrorToast/showSuccessToast/showInfoToast en src/ excluyendo el slice son 37, no 38; y ToastContainer.tsx tiene el aria-live en la línea 41, no en la 40. Y ojo con la regla propuesta: showUndoToast NO sirve para LogoMenu.tsx:43, porque esa ruta hace window.location.reload() y el toast muere con la página — ese caso sí necesita el <ConfirmDialog> de la opción (b).

## [ALTO] PanelErrorBoundary es código muerto: el árbol de 4 nodos del RFC tiene solo 3 cableados y los 7 paneles lazy quedan sin red

- D:\Desktop\projects\vina\src\components\ErrorBoundary\PanelErrorBoundary.tsx:15 — EXACTO. Clase completa de 48 líneas con getDerivedStateFromError, componentDidCatch, handleReset y UI («Error en {panelName}» + «Reiniciar el panel»).
- Grep de `PanelErrorBoundary` en src/ (recontado): 2 hits, ambos en su propio archivo (:15 y :23, este último dentro del template string del console.error). CERO call sites. CONFIRMADO como código muerto.
- D:\Desktop\projects\vina\docs\reports\2026-05-03-drift-fase2-e-async-states.md:190 — EXACTO, el RFC lo lista como parte del árbol.
- D:\Desktop\projects\vina\src\components\shell\AppShell.tsx:54-69 — VERIFICADO. `const fallback = <PanelLoading />;` en :54 y los 7 `case` (Avatar, BOM, Grading, Inspector, Nesting, Layers, Properties) devuelven `<Suspense fallback={fallback}>...</Suspense>` sin boundary alguno.
- D:\Desktop\projects\vina\src\bootstrap.tsx:48 `<AppErrorBoundary>` — EXACTO. D:\Desktop\projects\vina\src\components\shell\AppShell.tsx:283 `<Viewport3DErrorBoundary>` — EXACTO. D:\Desktop\projects\vina\src\components\Viewport3D\Viewport3D.tsx:864 `<SimulationErrorBoundary>` — EXACTO. Falta el nodo 2, confirmado.
- AppShell.tsx:25-33 — VERIFICADO: los 7 paneles son `lazy(() => import(...))`. El razonamiento técnico es correcto: Suspense no atrapa errores de render ni fallos de carga de chunk, así que suben hasta AppErrorBoundary.

> **Nota del verificador:** El hallazgo más limpio de los 8 junto con el de tokens fantasma. Una sola corrección de puntería: `renderPanelContent` arranca en AppShell.tsx:53, no en :52 (la regla propuesta cita mal la línea, la evidencia no).

## [ALTO] Vocabularios múltiples e incompatibles para «aquí no hay nada»; cobertura desigual de vacío/carga/error entre paneles

- Verificadas UNA A UNA todas las clases y sus líneas: EmptyState2D.tsx:25 `.empty-state-2d` (montado en PatternEditor.tsx:1043-1044) · PropertiesPanel.tsx:110 `.panel-empty` · LayerPanel.tsx:253 `.layer-empty` · BOMTab.tsx:222 `.bom-empty` · NestingTab.tsx:356 `.nesting-empty` · InspectorTab.tsx:50 `.inspector-tab inspector-empty` · AvatarPanel.tsx:457 `.ap-hint` · ConnectionsList.tsx:143 `<div style={emptyStyle}>` · UnifiedBarCommands.tsx:79-80 estilo inline. TODAS EXACTAS.
- D:\Desktop\projects\vina\src\components\LayerPanel\LayerPanel.tsx:338 — EXACTO y es la mejor prueba del hallazgo: `<div className="layer-empty" style={{ padding: '4px 8px', fontSize: '10px' }}>`. La única reutilización de una clase de vacío existente viene con padding y font-size anulados inline.
- La copia-pega literal es PEOR de lo que dice el auditor: BOMTab.css:210-216, NestingTab.css:118-124 y GradingTab.css:166-172 son las TRES la misma regla byte por byte (`display:flex; align-items:center; justify-content:center; color: var(--text-muted, #999); height:100%; padding:20px`). Son 3 copias, no 2.
- Cuatro tokens de color distintos para la misma idea semántica: CONFIRMADO — `--text-ghost` (PropertiesPanel.css:15), `--text-muted` (LayerPanel.css:40, BOMTab.css:214, NestingTab.css:122, GradingTab.css:170), `--text-secondary` (AvatarPanel.css:290), `--ink-on-light-3` (EmptyState2D.css:67).
- InspectorTab.tsx:112 `.inspector-agent-loading` y :115 `.inspector-agent-error` — EXACTOS. Es el único panel con los tres estados.
- AppShell.tsx:35-39 `PanelLoading` con estilo inline — EXACTO, es el único estado de carga compartido y vive inline, no en CSS.

> **Nota del verificador:** El hallazgo se sostiene pero tiene DOS errores de cifra que corrijo. (1) Los vocabularios son 10, no 9: al auditor se le escapó `.grading-empty` (GradingTab.tsx:284, GradingTab.css:166) — irónicamente el mismo panel que declaró «SIN clase de vacío». (2) La cobertura de carga es 6/12, no 5/12 (Propiedades, Capas, BOM, Escalado, Inspector, ChatIA). Además la tabla es internamente inconsistente: marca «carga HUECO» para Marcada y Avatar cuando ambos son casos del mismo switch de AppShell y reciben el MISMO `<Suspense fallback={<PanelLoading/>}>` que BOM y Escalado. La cifra de vacío (10/12) y la de error (3/12) sí las recontéé y son correctas.

## [ALTO] 63 llamadas var() apuntan a 9 tokens que no existen en ningún .css — sistema de diseño paralelo con hex disfrazado de token

- CENSO RECONTADO INDEPENDIENTEMENTE Y EXACTO AL DÍGITO. Extraje todas las definiciones `--x:` de src/**/*.css (75) y todas las referencias `var(--x)` de src/**/*.{css,tsx}, y el comm devuelve EXACTAMENTE los 9 fantasmas listados: --accent-color, --bg-hover, --border-color, --button-bg, --button-hover-bg, --panel-border, --panel-section-bg, --text-accent, --text-color.
- Conteo por token, recontado: --border-color 25, --text-color 16, --button-bg 7, --accent-color 5, --button-hover-bg 3, --bg-hover 3, --panel-section-bg 2, --panel-border 1, --text-accent 1. Suma 63. IDÉNTICO al del auditor, dígito por dígito.
- D:\Desktop\projects\vina\src\components\BottomPanel\BOMTab.css:19 — EXACTO `border-bottom: 1px solid var(--border-color, #333);`
- D:\Desktop\projects\vina\src\components\BottomPanel\BOMTab.css:25-27 — EXACTO. `background: var(--button-bg, #2a2a2a); color: var(--text-color, #ccc); border: 1px solid var(--border-color, #333);` — #2a2a2a no está en la paleta de tokens.css (verificado contra --bg-base #0c0c14, --bg-surface #10101c, --bg-elevated #1a1a2e en tokens.css:3-6).
- D:\Desktop\projects\vina\src\components\BottomPanel\BOMTab.css:87-88 — EXACTO. `var(--accent-color, #3b82f6)` dos veces, contra `--accent: #6366f1` en tokens.css:16. Dos azules de acento simultáneos: CONFIRMADO.
- Grep de `var(--fantasma)` SIN segundo argumento en src/: cero resultados. Confirmado que los 63 traen fallback y por eso ninguno se ve roto.
- Archivos contagiados recontados: son 8 (los 7 listados + DynamicProviderForm.tsx). El listado del auditor los nombra todos, solo etiqueta mal el total como «(7)».
- LayerPanel.css:3-4 (`--panel-border`, `--panel-section-bg`) y AvatarPanel.css:162 (`var(--bg-hover, #333)`) — EXACTOS.

> **Nota del verificador:** Es el hallazgo mejor medido del lote: reconstruí el censo desde cero con otro método y da el mismo número. Una sola matización: la frase «todos renderizan el hex» falla en un sitio — DynamicProviderForm.tsx:141 es `var(--text-accent, var(--accent, #6366f1))`, cuyo fallback es el token REAL del sistema, así que ese pinta el índigo correcto. Son 62 los que pintan hex crudo, no 63. Dato extra que refuerza la tesis y el auditor no vio: los 75 tokens definidos no viven todos en tokens.css — 67 están ahí y otros 8 en src/App.css (por ejemplo `--color-error: #ef4444` en App.css:26, consumido desde UnifiedBarChat.tsx:303 y :342 y desde ConnectionCard.tsx:177). El verify-tokens.mjs propuesto debe mirar ambos archivos o va a marcar falsos positivos.

## [ALTO] Cargar un avatar no tiene ni estado de carga ni estado de error: Suspense fallback={null} y un console.error a solas

- D:\Desktop\projects\vina\src\components\Viewport3D\Viewport3D.tsx:834 — EXACTO. `<Suspense fallback={null}>` envolviendo `<AvatarModel url={avatarModelUrl} .../>`.
- D:\Desktop\projects\vina\src\components\Viewport3D\AvatarModel.tsx:202-204 — EXACTO al carácter. `}).catch((err) => { console.error('[AvatarModel] Failed to load mesh:', err); });` y ahí termina. Sin dispatch, sin toast, sin estado.
- D:\Desktop\projects\vina\src\components\Viewport3D\AvatarPanel.tsx:198 — EXACTO. `accept=".obj,.fbx,.glb,.gltf,.vrm"`.
- Grep de `:focus` en AvatarPanel.css: 0 hits. CONFIRMADO.
- D:\Desktop\projects\vina\src\components\shell\AppShell.tsx:8 importa showErrorToast y lo usa en :130 como `dispatch(showErrorToast(dxfErrorMessage(err)))`, con dxfErrorMessage definido en src/components/shell/dxfImport.ts:25. El contraste con el patrón correcto ya existente en el repo: CONFIRMADO.
- Recuento de console.error/warn en src/components/**/*.tsx sin tests: 27. EXACTO.
- Refuerzo que el auditor no citó: AvatarPanel.tsx:114 `if (!supported.includes(ext)) return;` — segundo camino de fallo silencioso en la misma función, antes siquiera de llegar a la carga.

> **Nota del verificador:** Confirmado íntegro. Solo una imprecisión de línea: el disparo `dispatch(setAvatarModelUrl(url))` está en AvatarPanel.tsx:116, no en :117 (:117 es `setModelName(file.name)`). No cambia nada del argumento.

## [MEDIO] Tres implementaciones distintas del cierre con Escape, cero trampas de foco, y ConnectionModal sin Escape

- D:\Desktop\projects\vina\src\copilot\connections\ConnectionModal.tsx — grep de 'Escape': 0 hits. CONFIRMADO. El único useEffect está en :125 (carga de valores), y el cierre por backdrop en :168-174 (`<div style={overlayStyle} onMouseDown={(e)=>{ if (e.target === e.currentTarget) props.onClose(); }}>`).
- D:\Desktop\projects\vina\src\components\PatternEditor\CalibrationModal.tsx:17-27 — EXACTO. useEffect con window.addEventListener('keydown'), Enter confirma / Escape cancela, deps `[value, onConfirm, onCancel]`. Grep de role= y aria- en el archivo: 0 hits, confirmado sin semántica.
- D:\Desktop\projects\vina\src\components\PatternEditor\NotchPrecisionModal.tsx:67 — EXACTO. `<div className="notch-precision-modal" role="dialog" aria-label="Colocación de piquete">`, el único con role. Su listener usa fase de captura (`addEventListener(..., true)`) + stopPropagation, divergencia real frente a CalibrationModal.
- D:\Desktop\projects\vina\src\components\shell\ContextPanel.tsx:16-22 — EXACTO al rango. Cuarta copia del mismo useEffect, para el host de los 7 paneles.
- Grep de aria-modal / FocusTrap / trapFocus en src/: 0 hits reales. Los 4 matches de 'inert' son la palabra en comentarios de geometría (nodeEditorUtils.ts:80, AppShell.tsx:110, geometricClassifier.ts:232, semanticEdges.ts:49). CERO trampas de foco en toda la app: CONFIRMADO.
- ConnectionModal.tsx:168 y :175 — EXACTOS. Los dos div (overlay y diálogo) llevan onMouseDown sin role, sin tabIndex y sin manejador de teclado.

> **Nota del verificador:** El hallazgo se sostiene, pero REFUTO la consecuencia que lo dramatiza. El auditor afirma «un usuario de teclado queda encerrado... no puede cerrar el diálogo», y él mismo cita la ✕ de ConnectionModal.tsx:180-186 — que es un `<button type="button">` nativo con `aria-label="Cerrar"`. Un botón nativo es alcanzable con Tab y se activa con Enter o Espacio: el diálogo SÍ se puede cerrar solo con teclado. Lo que falta de verdad es Escape, la trampa de foco y aria-modal, que es defecto suficiente y no necesita el adorno. Matizo también «tres maneras distintas»: CalibrationModal y NotchPrecisionModal son casi la misma implementación con dos divergencias (fase de captura y stopPropagation) — o sea copia-pega con deriva, que es exactamente la tesis del dueño, pero descrito con más precisión que «tres firmas distintas».

## [MEDIO] --text-dim, --text-ghost y --ink-on-light-3 quedan por debajo del mínimo AA en el texto que enseña qué hacer

- RECALCULÉ TODOS LOS RATIOS CON WCAG 2.1 (sRGB relative luminance) Y COINCIDEN AL CENTÉSIMO. --text-dim #4a4a6a: base 2.30 / surface 2.23 / elevated 2.01 (auditor: 2.30 / 2.23 / 2.01). --text-ghost #6a6a8a: surface 3.63 / elevated 3.28 (auditor: idénticos). --ink-on-light-3 #a0a5b0 sobre --canvas-2d #f1efe8: 2.15 (auditor: 2.15). --ink-on-light-2 #6f7480 sobre canvas: 4.07 (auditor: 4.07). Los que pasan también: --text-primary 15.31, --text-secondary 7.44, --text-muted 5.51, --ink-on-light 11.96. TODOS EXACTOS.
- D:\Desktop\projects\vina\src\styles\tokens.css:14 --text-ghost y :15 --text-dim — EXACTOS. :16 --accent: #6366f1 — EXACTO. :34 --ink-on-light-3 — EXACTO.
- D:\Desktop\projects\vina\src\components\shell\UnifiedBarCommands.tsx:69 — EXACTO. `fontSize: '10px', color: 'var(--text-dim)', background: 'var(--border-subtle)'`. Recalculé #4a4a6a sobre #12121f: 2.19. EXACTO.
- D:\Desktop\projects\vina\src\components\shared\SubMenu.css:16 — EXACTO. `.submenu-arrow { color: var(--text-dim); font-size: 11px; margin-left: 12px; }`
- D:\Desktop\projects\vina\src\components\PropertiesPanel\PropertiesPanel.css:493 y D:\Desktop\projects\vina\src\styles\floating.css:146-147 — EXACTOS.
- D:\Desktop\projects\vina\src\components\PatternEditor\EmptyState2D.css:67 (.empty-state-2d__drop-hint, 11px, «o suelta tu .dxf aquí»), :93 (.empty-state-2d__kbd) y :105 (.empty-state-2d__ai-hint, 11px) — LOS TRES EXACTOS, los tres con --ink-on-light-3 a 2.15:1.
- --text-ghost en 16 sitios: recontado con grep -c por archivo, suma 16 (incluida la definición). EXACTO. Entre ellos PanelLoading en AppShell.tsx:36 a 13px y .panel-empty en PropertiesPanel.css:15.
- D:\Desktop\projects\vina\src\components\PatternEditor\renderers\SeamRenderer.tsx:142 — EXACTO. `const baseColor = isInactive ? 'var(--ink-on-light-3)' : seamPairColor(seam.id);` El auditor tiene razón en separar los dos usos: aquí 2.15:1 es decisión de dibujo defendible (línea que debe receder), no texto.
- tokens.css:7-8 — EXACTO, el comentario de luminancia sobre --border ya existe y sirve de precedente para la regla propuesta.

> **Nota del verificador:** El hallazgo con la aritmética mejor hecha del lote: 12 ratios recalculados desde cero, 12 coincidencias. No es consejo de landing page — contraste de texto es accesibilidad básica y aquí toca justamente el texto de ayuda (drop-hint del DXF, tecla de atajo, chevron de submenú), no la densidad de la interfaz. Correcciones menores: --ink-on-light-2 está en tokens.css:33, no :32; y falta señalar que --text-muted (#8888a8) también baja a 4.98 sobre --bg-elevated, o sea que roza el umbral en la superficie más clara — el peldaño 3 de la escala está al borde, no solo los dos últimos rotos.

## [BAJO] Una sola región viva (aria-live) en toda la aplicación; lo etiquetado está bien, lo dinámico no tiene convención

- Grep de aria-live en src/**/*.tsx sin tests: UN SOLO HIT, src\components\shell\ToastContainer.tsx:41 `<div className="toast-container" aria-live="polite" aria-label="Notifications">`. La afirmación central del hallazgo: CONFIRMADA.
- Recuento de `<button` en .tsx no-test: 170. EXACTO al número del auditor.
- D:\Desktop\projects\vina\src\components\PropertiesPanel\PieceProperties.tsx:210 y :214 — EXACTOS. Ambos `<button className="panel-btn-sm" onClick={...} disabled={...}>+</button>`, sin más etiqueta que el carácter «+» (añadir plantilla y añadir texto personalizado, respectivamente).
- D:\Desktop\projects\vina\src\components\BottomPanel\InspectorTab.tsx:112 y :115 — EXACTOS, y en efecto el bloque `.inspector-agent` que arranca en :110 no lleva aria-live.
- D:\Desktop\projects\vina\src\components\shell\UnifiedBarChat.tsx:331 — EXACTO. `{runningToolName ? \`Ejecutando ${runningToolName}...\` : 'Pensando...'}` sin región viva.
- D:\Desktop\projects\vina\src\components\shell\UnifiedBarCommands.tsx:53 — EXACTO, los ítems son `<button>` dentro de un contenedor sin role="listbox" ni aria-activedescendant.
- Los elementos clicables no-button citados existen: LayerPanel.tsx:273 (`.layer-group-header` con onClick en :275), CollisionBodyPanel.tsx:111 (`.cb-body-item` con onClick en :113), AvatarPanel.tsx:205 (`.ap-dropzone` con onClick), ConnectionModal.tsx:168 y :175. Ninguno con tabIndex ni onKeyDown.

> **Nota del verificador:** La conclusión se sostiene pero el CENSO ESTÁ INFLADO y hay que corregirlo antes de citarlo. Recontado sobre src/**/*.tsx EXCLUYENDO tests: 64 atributos aria-*, no 74 — aria-label 47 (no 50), aria-pressed 8 (no 11), aria-hidden 6 (no 7), aria-expanded 2, aria-live 1. El 74 del auditor sale de INCLUIR los archivos de test (incluyendo tests y .ts el total sube a 75), justo lo contrario de lo que su propia evidencia dice («sin tests»). El desglose que da tampoco suma: 50+11+7+2+1 = 71, no 74. Lo demás lo verifiqué y aguanta: 170 botones exacto, 33 archivos con aria exacto, 189 .tsx sin tests exacto, y un solo aria-live. También corrijo la línea: el aria-live está en ToastContainer.tsx:41, no :40.

## [ALTO] Los sliders del panel de Render dependen del CSS de un chunk lazy que puede no haber cargado

- src/components/shell/AppShell.tsx:25 = `const AvatarPanel = lazy(() => import('../Viewport3D/AvatarPanel'));` CONFIRMADO. AppShell.tsx:57 lo monta solo en el `case 'Avatar'` del switch de paneles.
- src/components/Viewport3D/AvatarPanel.tsx:18 = `import './AvatarPanel.css';` CONFIRMADO. Recontado: grep de 'AvatarPanel.css' en todo src/ devuelve UNA sola linea. Es el unico importador del repo.
- src/components/Viewport3D/AvatarPanel.css: reglas reales en 217 (.ap-slider-control display:flex/gap:6px), 223 (input[type=range] flex:1 height:4px), 233 (::-webkit-slider-thumb), 242 (input[type=number] width:46px border 1px solid var(--border-color,#444)). Las dos lineas citadas por el auditor (223 y 242) son exactas.
- Recontado el consumo de .ap-slider-control fuera de AvatarPanel: 11 usos en 5 archivos. GroundSection.tsx:40 y :65, EnvironmentSection.tsx:56, ExportSection.tsx:96, LightingSection.tsx:95/117/135/159/177, RenderQualitySection.tsx:46/71.
- src/components/Viewport3D/RenderSettingsPanel.css: grep de 'range|slider' sale VACIO. La hoja propia del panel de Render no define nada de slider. CONFIRMADO.
- Cadena de import estatico CONFIRMADA y mas fuerte que la citada: AppShell.tsx:18 importa Viewport3D estaticamente, y Viewport3D.tsx:46 importa RenderSettingsPanel estaticamente. El panel de Render vive en el chunk principal.
- vite.config.ts no declara `cssCodeSplit`, o sea queda en el default true: el CSS de un chunk lazy se carga con el chunk, nunca antes. El mecanismo se sostiene tanto en build como en dev (Vite inyecta el CSS al cargar el modulo).

> **Nota del verificador:** Mecanismo CONFIRMADO al 100%: clase con prefijo privado de un componente lazy, consumida desde un componente del chunk principal. BAJO la severidad de BLOQUEANTE a ALTO. Verifique que se pierde: el display:flex del contenedor, el flex:1 y height:4px del range, el thumb webkit, y el width:46px + borde del input numerico. NO se pierde funcionalidad: el input[type=range] nativo sigue arrastrandose y el numerico sigue aceptando valores. Queda feo y desalineado, no roto. 'Rompe uso real' no aplica.

## [ALTO] El boton deshabilitado de Marcada no tiene ningun estado visual de deshabilitado (el clon hermano si lo tiene)

- src/components/BottomPanel/NestingTab.tsx:290 = `<button onClick={handleNest} disabled={activePieces.length === 0}>` CONFIRMADO. El disabled es real: NestingTab.tsx:113 tiene ademas el guard `if (activePieces.length === 0) return;`.
- src/components/BottomPanel/NestingTab.css:22 = `.nesting-toolbar button { font-size:11px; padding:3px 8px; background:var(--button-bg,#2a2a2a); color:var(--text-color,#ccc); border:1px solid var(--border-color,#333); border-radius:3px; cursor:pointer; }` CONFIRMADO linea por linea.
- src/components/BottomPanel/NestingTab.css:33 = `.nesting-toolbar button:hover { background: var(--button-hover-bg,#3a3a3a); }` sin :not(:disabled). CONFIRMADO.
- grep de 'disabled' en NestingTab.css: CERO resultados. CONFIRMADO, no hay ninguna regla de deshabilitado en el archivo.
- src/components/BottomPanel/GradingTab.css:37 = `.grading-toolbar button:disabled { opacity:0.4; cursor:default; }` CONFIRMADO en la linea exacta.
- src/components/BottomPanel/BOMTab.css:22 y :33 CONFIRMADOS byte a byte contra NestingTab.css:22 y :33: la unica diferencia textual es el nombre de clase.
- EVIDENCIA QUE EL AUDITOR NO USO Y REFUERZA EL HALLAZGO: GradingTab.tsx:295 tiene el MISMO patron estructural (`<button onClick={handleGrade} disabled={...}>` en la toolbar) y ESE si esta cubierto por su :disabled. La correccion existe exactamente en el hermano que la necesita y falta exactamente en el otro.

> **Nota del verificador:** Corregi el titulo: el boton NO se llama 'Nest', el label real es 'Crear marcada' (NestingTab.tsx:291). Baje de BLOQUEANTE a ALTO: el atributo disabled es real, o sea el click no dispara nada y no hay corrupcion de estado; el defecto es de affordance, no funcional, y solo aparece con cero piezas activas. Ademas dos sub-afirmaciones del auditor son de runtime y NO las verifique en navegador: que el :hover se aplique a un boton disabled en Chromium, y que el cursor:pointer sobreviva. Lo que si es estaticamente irrefutable es que no existe NINGUN tratamiento visual de deshabilitado (ni opacity, ni cursor, ni color) mientras el clon hermano si lo tiene. Nota menor: BOMTab.css tampoco tiene :disabled pero BOMTab.tsx no tiene ningun boton con disabled=, asi que ahi el hueco es latente, no visible.

## [ALTO] 59 llamadas var() a 8 tokens que no existen: el hex del fallback es siempre lo que se pinta

- RECONTADO Y EXACTO: los 8 tokens no estan definidos en ningun lado. grep -rnE '^\s*--(text-color|border-color|button-bg|button-hover-bg|bg-hover|accent-color|panel-section-bg|panel-border)\s*:' sobre src/ devuelve CERO resultados. Los unicos dos :root del repo son src/styles/tokens.css:1 y src/App.css:13, tambien confirmado con grep.
- RECONTADO Y EXACTO: 59 usos en .css. Desglose propio: --text-color 16, --border-color 22, --button-bg 7, --button-hover-bg 3, --bg-hover 3, --accent-color 5, --panel-section-bg 2, --panel-border 1 = 59. Hay 3 usos adicionales en .tsx que el auditor no conto (total real 62).
- src/components/BottomPanel/BOMTab.css:22-30 CONFIRMADO literal: las tres var() resuelven al hex.
- src/components/BottomPanel/NestingTab.css:66 = `border-color: var(--accent-color, #3b82f6);` CONFIRMADO en la linea exacta. Contra tokens.css:16 `--accent: #6366f1`. Los dos azules divergen de verdad.
- RECONTADO Y EXACTO: 8 apariciones de `var(--accent, #007acc)` (AvatarPanel.css:122/123/171/172/199/238/271/273) y 3 de `var(--accent, #4a9eff)` (ReferenceImageSettings.css:18/100/125). Tres modelos mentales del acento conviviendo, CONFIRMADO.
- src/components/LayerPanel/LayerPanel.css:4 usa `var(--panel-section-bg, #2a2a3e)` y LayerPanel.css:10 usa `var(--panel-section-bg, #1e1e3a)`. El mismo token inexistente con DOS fallbacks distintos, en el mismo archivo, a 6 lineas. CONFIRMADO.
- src/App.css:18-21 el comentario existe textualmente y dice lo que el auditor cita.

> **Nota del verificador:** El conteo de 59 es EXACTO, lo verifique de forma independiente. UN ERROR FACTUAL en una vineta: en AvatarPanel.css:150-155 el auditor dice que --border-color y --bg-secondary 'no existen'. --bg-secondary SI existe, esta definido en src/App.css:15 con valor #242424 (y el fallback escrito es #2a2a2a, o sea el fallback miente sobre el valor real pero nunca se aplica). Solo --border-color de esa terna es inexistente. El resto de la vineta y todo el hallazgo se sostienen.

## [ALTO] Dos modales hermanos, misma regla CSS linea por linea, dos design systems y dos azules primarios distintos

- src/components/PatternEditor/CalibrationModal.css:64 CONFIRMADO en la linea exacta: `padding:6px 16px; border-radius:4px; border:1px solid #555; background:#333; color:#e0e0e0; cursor:pointer; font-size:13px;` Cien por ciento hardcodeado.
- src/components/PatternEditor/NotchPrecisionModal.css:75 CONFIRMADO en la linea exacta: mismas 7 propiedades, MISMO ORDEN, todas tokenizadas (--radius-sm, --border, --bg-surface, --text-primary, --text-ui).
- CalibrationModal.css:74 = `.calibration-actions button.primary { background:#0078d4; border-color:#0078d4; color:#fff; }` CONFIRMADO.
- NotchPrecisionModal.css:85 = `.notch-precision-actions button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }` CONFIRMADO. tokens.css:16 dice --accent:#6366f1. Los dos azules primarios existen y divergen.
- CalibrationModal.css:80 = deshabilitado por hex de 8 digitos `#0078d480`. NotchPrecisionModal.css:91 = deshabilitado por `opacity:0.5`. Dos tecnicas, CONFIRMADO en las lineas exactas.
- Divergencia tipografica CONFIRMADA contra tokens.css: CalibrationModal usa font-size:13px fijo; NotchPrecisionModal usa --text-ui = clamp(12px,0.65vw+3px,15px), que escala con el viewport. Y radios 4px vs --radius-sm (tokens.css:84 = 6px).
- CalibrationModal.tsx:45 abre `<div className="calibration-actions">` y NotchPrecisionModal.tsx:106 abre `<div className="notch-precision-actions">`. Misma estructura: boton sin clase + boton .primary con disabled.
- Divergencia extra que el auditor no cito: NotchPrecisionModal.css:57 tiene `.invalid { border-color: var(--destructive); }` y CalibrationModal no tiene nada equivalente.

> **Nota del verificador:** Todas las lineas citadas son exactas, verificadas una por una con grep -n. UNA imprecision: el auditor dice 'markup identico' con `<button>Cancelar</button>`. La estructura es identica pero los labels NO: NotchPrecisionModal dice 'Mantener el clic' y 'Colocar exacto' (lineas 107 y 112), no 'Cancelar'/'Aplicar'. Eso no toca la sustancia (el argumento es sobre el par de botones y su estilo, no sobre el texto).

## [ALTO] El boton de icono canonico existe, esta tokenizado, y solo 3 sitios lo usan

- src/styles/base.css:41 CONFIRMADO: `.icon-btn { width:var(--toolbar-btn); height:var(--toolbar-btn); border-radius:var(--radius-sm); transition:background var(--transition-fast); color:var(--text-muted); }`. base.css:53 hover con --bg-elevated, base.css:54 `.icon-btn--active` con la terna --accent-subtle/--accent/--accent-border. Las tres lineas citadas son exactas.
- RECONTADO Y EXACTO: los consumidores de `.icon-btn` en .tsx son exactamente 3, ContextPanel.tsx:45, TopBar.tsx:40 y TopBar.tsx:50. Ni uno mas.
- CLON 1 src/components/shell/Dock.css:31 CONFIRMADO: width/height 38px hardcodeados, --radius-md (tokens.css:85 = 8px), hover --bg-elevated, activo --accent-subtle (Dock.css:56).
- CLON 2 src/styles/unified-bar.css:53 CONFIRMADO: 36px, border-radius:50%. Y unified-bar.css:69 CONFIRMADO: `background: rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.2)`. Contra tokens.css:18-19 que valen 0.13 y 0.27. El indigo escrito a mano con alfas equivocadas es real.
- CLON 3 src/components/Viewport3D/CollisionBodyPanel.css:110 CONFIRMADO: `padding:2px 5px; border-radius:3px; color:#888;`, hover en :119 con rgba(255,255,255,0.1), activo en :120 con #4a9eff.
- CLON 4 src/components/LayerPanel/LayerPanel.css:25 CONFIRMADO: `padding:2px` y sin border-radius. Activo en :27 con #6366f1 escrito a mano.
- CLON 5 src/components/PatternEditor/ReferenceImageSettings.css:79 CONFIRMADO: 22px, border-radius:4px, color rgba(255,255,255,0.4). Activo en :99 con var(--accent,#4a9eff).
- CLON 6 src/components/Viewport3D/FitMapToggle.tsx:109 CONFIRMADO: `toggleBtn: (active) => ({ width:32, height:32, borderRadius:3, background: active ? '#4a90d9' : 'transparent' })`. Cuarto azul de activo, en objeto JS.
- CLON 7 src/components/PatternEditor/FloatingActionBar.tsx:89-104 CONFIRMADO: 28px, borderRadius:4, color '#e0e0e0', todo inline.
- RECONTADO: los 6 radios distintos son exactos. 0 (layer), 3px (cb, FitMap), 4px (ref-img, FloatingActionBar), --radius-sm 6px (icon-btn), --radius-md 8px (dock), 50% (unified-bar). Y los 4 colores de activo hardcodeados son exactos: #6366f1, rgba(99,102,241,.1), #4a9eff, #4a90d9.

> **Nota del verificador:** El nucleo se sostiene entero: el contrato existe, esta bien hecho, y tiene 3 consumidores. Tres correcciones. (1) El '26' de la lista de tamanos no sale de ninguno de los 7 clones citados. Existen botones de 26px en ReferenceImageSettings.css:132 y SnapshotBar.css:77, pero el auditor no los cito: la cifra esta sin respaldo. (2) '~40 consumidores de los clones' esta inflado: reconte las ocurrencias en .tsx de las 5 clases CSS clonadas y dan 31 (dock__tool 16, ref-img-btn 6, unified-bar__mode-btn 3, cb-icon-btn 3, layer-icon-btn 3), mas los dos inline. (3) CLON 1 y CLON 2 son los mejor portados: Dock.css:50 tiene :focus-visible propio y ambos usan tokens salvo el rgba de unified-bar. Llamarlos 'reimplementaciones' de .icon-btn fuerza un poco: un tool de dock y un toggle de modo son roles distintos de un boton de icono de cabecera. La deriva de verdad esta en los clones 3 a 7.

## [ALTO] Dos bloques :root con semantica en conflicto: dos verdes de exito y dos amarillos de advertencia

- RECONTADO: grep de ':root' en todo src/ devuelve exactamente 2 resultados, src/styles/tokens.css:1 y src/App.css:13. CONFIRMADO.
- tokens.css:21 `--success: #22c55e;` vs App.css:28 `--color-success: #10b981;` CONFIRMADO en las lineas exactas.
- tokens.css:23 `--warning: #f59e0b;` vs App.css:27 `--color-warning: #cca700;` CONFIRMADO.
- tokens.css:22 `--destructive: #ef4444;` vs App.css:26 `--color-error: #ef4444;` CONFIRMADO, mismo valor con dos nombres.
- Orden de carga CONFIRMADO: App.css:2 hace @import de base.css, y base.css:1-2 hace @import de tokens.css y reset.css. El :root de App.css:13 se declara DESPUES, o sea gana en colision.
- src/App.css:18-21 el comentario existe textualmente y documenta el bug de app entera.
- src/components/PropertiesPanel/PropertiesPanel.css:248 `.panel-chip-btn--success { color: var(--success); }` CONFIRMADO (el auditor cito 247, la regla abre en 247 y la propiedad esta en 248).
- src/copilot/connections/ConnectionCard.tsx:160 `background: 'var(--color-warning, #ca8a04)'` y ConnectionCard.tsx:177 `color: 'var(--color-error, #f87171)'` CONFIRMADOS (el auditor cito 158 y 174, que son donde abren los bloques; deriva de 2-3 lineas).
- HALLAZGO PROPIO QUE FORTALECE EL CASO: el auditor puso el segundo verde como hipotetico ('saldria'). NO es hipotetico. src/components/Viewport3D/AvatarPanel.css:284 `.ap-joint-info { color: var(--color-success); }` pinta #10b981 HOY, mientras PropertiesPanel.css:248 pinta #22c55e. Los dos verdes estan vivos y renderizando en la app.

> **Nota del verificador:** Confirmado y reforzado. La unica correccion es que el ejemplo del copiloto que dio el auditor era hipotetico; el consumidor real de --color-success que prueba la colision es AvatarPanel.css:284, que el auditor no encontro. Su calificacion del tercer amarillo como 'latente' es precisa: --color-warning si existe (App.css:27), asi que el fallback #ca8a04 de ConnectionCard nunca se aplica; es codigo muerto que documenta un tercer modelo mental, no un tercer amarillo pintado.

## [MEDIO] FloatingActionBar: barra de controles con cromo 100% inline y una clase BEM sin CSS detras

- src/components/PatternEditor/FloatingActionBar.tsx:89 = `className="floating-action-bar__btn"` CONFIRMADO. Recontado: grep de 'floating-action-bar' en todo el repo devuelve solo TSX y tests (lineas 65 y 89 del componente, y 5 selectores en __tests__/FloatingActionBar.test.tsx). CERO definiciones CSS para las dos clases. CONFIRMADO.
- FloatingActionBar.tsx:92-104 CONFIRMADO literal: width:28, height:28, background:'transparent', border:'none', borderRadius:4, color:'#e0e0e0', cursor:'pointer'.
- FloatingActionBar.tsx:66-81 (contenedor) CONFIRMADO literal: zIndex:90, padding:4, backgroundColor:'#1a1a1a', border:'1px solid #333', borderRadius:6, boxShadow:'0 2px 8px rgba(0,0,0,0.4)'.
- El punto del z-index CONFIRMADO y ampliado: los valores z-index en .css son exactamente los 15 del censo. En .tsx inline aparecen ademas 50 y 90, o sea son DOS valores fuera del censo, no uno. FloatingActionBar aporta el 90.
- El contraste con el mismo rol tokenizado es real: base.css:41 (.icon-btn) y Dock.css:31 (.dock__tool, con :focus-visible propio en Dock.css:50).

> **Nota del verificador:** REFUTE dos de las tres consecuencias del titulo original ('hover, focus y disabled son imposibles por construccion') y por eso lo retitule y baje de ALTO a MEDIO. (1) FOCUS: src/styles/reset.css:15 declara `:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }` como selector global sin restriccion; el estilo inline del boton no toca outline, asi que el anillo de foco SI se pinta al navegar con teclado. (2) HOVER: el boton esta envuelto en `<ToolTooltip>` (FloatingActionBar.tsx:87), o sea pasar el mouse SI produce respuesta visual, un tooltip con nombre y atajo. Decir 'no produce absolutamente ninguna respuesta visual' es falso. (3) DISABLED: ningun boton de esta barra recibe disabled, asi que el punto es hipotetico. Lo que queda verificado y vale: cromo estatico 100% inline, clase BEM fantasma sin hoja, cero cambio de fondo en hover, y un z-index fuera del censo.

## [ALTO] src/copilot no tiene ni un archivo CSS: 43 objetos de estilo en JS, un design system paralelo

- RECONTADO Y EXACTO: `find src/copilot -name '*.css'` devuelve 0. Y grep de imports .css dentro de src/copilot tambien devuelve 0.
- RECONTADO Y EXACTO: 43 ocurrencias de `style={{` en src/copilot. Desglose propio: AgentSettings.tsx 24, ConnectionModal.tsx 6, DynamicProviderForm.tsx 6, ConnectionCard.tsx 4, ConnectionsList.tsx 3. Suman 43 y son exactamente los 5 archivos que el auditor nombro.
- src/copilot/connections/ConnectionCard.tsx:74 = `const iconBtnStyle: React.CSSProperties = { background:'transparent', border:'1px solid var(--border)', color:'var(--text-secondary)', padding:'6px 12px', borderRadius:5, fontSize:12, cursor:'pointer', fontWeight:500 };` CONFIRMADO en la linea exacta.
- ConnectionCard.tsx:174 y :179 son los dos <button> sin className que consumen iconBtnStyle (el segundo con override de color). La deriva de linea respecto a lo citado (172/175) es de 2-4 lineas; los dos botones existen y son como el auditor los describe.
- Las 8 declaraciones de estilo CONFIRMADAS en sus lineas exactas: cardStyle:24, cardActiveStyle:36, cardDisabledStyle:41, labelStyle:45, subLabelStyle:55, badgeStyle:62, iconBtnStyle:74, toggleStyle:85, toggleKnobStyle:97. Es un sistema de tokens completo escrito en JS.
- El punto de fondo CONFIRMADO: estos objetos consumen tokens desde strings (`var(--border)`, `var(--accent, #6366f1)`), asi que ningun linter de CSS ni el censo de hex los alcanza.

> **Nota del verificador:** Los dos conteos son exactos, los verifique de forma independiente. UNA correccion menor: el auditor dice que borderRadius 5 'solo existe aqui y en ReferenceImageSettings.css:17'. Recontado, `border-radius: 5px` aparece en TRES sitios CSS: ReferenceImageSettings.css:17, ReferenceImageSettings.css:45 y EmptyState2D.css:82. El argumento no cambia (sigue siendo un radio fuera del sistema), pero el numero estaba corto. Observacion propia: el objeto se llama iconBtnStyle y no estila ningun icono, tiene padding '6px 12px' y envuelve los labels de texto 'Editar' y 'Eliminar'. El nombre miente, lo que refuerza la tesis de capa paralela sin revision.

## [MEDIO] Cero feedback de pulsado: :active no existe en ningun boton del proyecto

- RECONTADO Y EXACTO: grep -rnE ':active' sobre los .css de src/, filtrando .active/--active/.is-active, devuelve UN solo resultado en todo el repo: src/components/LayerPanel/LayerPanel.css:21 `.layer-piece-drag-handle:active { cursor: grabbing; }`. Es un cursor sobre un manejador de arrastre, no un boton. CONFIRMADO.
- grep de ':active' en .tsx: CERO resultados. No hay ninguna implementacion equivalente en JS que compense.
- Las 4 clases .active citadas son clases de estado persistente y CONFIRMADAS en sus lineas exactas: AvatarPanel.css:270 (.ap-preset-btn.active), CollisionBodyPanel.css:120 (.cb-icon-btn.active), LayerPanel.css:27 (.layer-icon-btn.active), ReferenceImageSettings.css:99 (.ref-img-btn.active). La distincion que hace el auditor entre clase y pseudo-clase es correcta.

> **Nota del verificador:** La afirmacion que carga el hallazgo (cero :active de pulsado en botones) es irrefutable, la verifique de forma exhaustiva. NO pude reproducir el desglose de cobertura '67 selectores con forma de boton: :hover 39, :disabled 10, :focus-visible propio 3'. Mis conteos crudos sobre todo el CSS dan 76 lineas con :hover, 18 con :disabled, y 5 reglas :focus-visible fuera de reset.css (EmptyState2D.css:51/87/115 y Dock.css:50/125). El recorte del auditor a '67 selectores con forma de boton' no es reproducible mecanicamente, asi que trato esas tres cifras como no verificadas. El cero, si.

## [MEDIO] EmptyState2D mata el anillo de foco global y lo reemplaza por un cambio de color

- src/styles/reset.css:15 CONFIRMADO en la linea exacta: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }`. Es global y correcto.
- src/components/PatternEditor/EmptyState2D.css:86-90 CONFIRMADO: el selector agrupado `.empty-state-2d__secondary:hover, .empty-state-2d__secondary:focus-visible` abre en 86 y el cuerpo es `color: var(--ink-on-light); outline: none;`. El auditor cito 87-90, deriva de una linea. La sustancia es exacta: mata el anillo y solo cambia el color del texto.
- El cambio es de --ink-on-light-2 (#6f7480, tokens.css) a --ink-on-light (#2b2d33). Color como unico indicador. CONFIRMADO.
- src/components/PatternEditor/EmptyState2D.css:115-118 CONFIRMADO en las lineas exactas: `.empty-state-2d__ai-hint:focus-visible { outline: 2px solid var(--accent-2d); outline-offset: 2px; }`. La regla contradictoria esta en el MISMO archivo, 29 lineas despues.
- src/components/PatternEditor/EmptyState2D.css:50-56 CONFIRMADO: `.empty-state-2d__primary:hover:not(:disabled), .empty-state-2d__primary:focus-visible { border-color:var(--accent-2d); box-shadow: inset 0 0 0 0.6px var(--accent-2d); color: var(--accent-2d); outline:none; }`. Ese si deja indicador alternativo (borde + sombra interior + color).
- El patron de agrupar :hover con :focus-visible en el mismo bloque, que es el mecanismo del error, CONFIRMADO en los dos sitios (lineas 50-51 y 86-87).

> **Nota del verificador:** Confirmado sin correcciones de fondo. El caso mas grave es solo el de __secondary (86-90), que deja el foco con cambio de color como unico indicador. El de __primary (50-56) tambien hace outline:none pero sustituye por border-color + inset box-shadow + color, o sea cumple la excepcion razonable. La contradiccion interna que denuncia el auditor es real y verificable: tres botones en un mismo archivo con tres politicas de foco distintas.

## [MEDIO] Siete looks de input numerico, cuatro comportamientos de foco distintos, y un solo estado de error en todo el proyecto

- 1. PropertiesPanel.css:145 (.panel-input, tokenizado, width 120px) y :162 (foco outline:none + border-color var(--accent)) CONFIRMADOS en lineas exactas.
- 2. BOMTab.css:147 (.bom-row td input, transparente, radius 3px, font-size 11px) y :160 (foco border-color var(--accent-color,#3b82f6)) CONFIRMADOS en lineas exactas.
- 3. GradingTab.css:119 (.grading-table td input[type=number], width 60px) CONFIRMADO en linea exacta.
- 4. NestingTab.css:53 (.nesting-toolbar input[type=number], width 50px) y :66 (foco #3b82f6) CONFIRMADOS.
- 5. CalibrationModal.css:46 (background #1e1e1e, border #555, radius 4px, font-size 13px) CONFIRMADO. grep de ':focus' en ese archivo: CERO. Sin regla de foco, correcto.
- 6. NotchPrecisionModal.css:45 (tokenizado) CONFIRMADO, y :57 `.invalid { border-color: var(--destructive); }` CONFIRMADO en linea exacta.
- 7. AvatarPanel.css:242 (width 46px, border var(--border-color,#444), radius 3px, font-size 10px) CONFIRMADO. Sin foco.
- AFIRMACION MAS FUERTE DEL HALLAZGO, RECONTADA Y EXACTA: grep -rnE '\.invalid|:invalid|aria-invalid|input-error' sobre todos los .css devuelve UN solo resultado en el repo entero, NotchPrecisionModal.css:57. Un unico input en todo el proyecto sabe decir que el valor esta mal.

> **Nota del verificador:** Los 7 puntos existen en las lineas citadas y la afirmacion de cierre (un solo estado invalido en todo el repo) es exacta, la verifique con una busqueda independiente. UNA imprecision: el punto 3 no es 'clon byte-a-byte' del 2. GradingTab.css:119 usa otro selector (.grading-table td input[type=number] vs .bom-row td input) y ademas agrega text-align:right y font-variant-numeric:tabular-nums. Es un cuasi-clon, no un clon literal. Y el auditor tiene razon en el matiz de accesibilidad: los 5 sin :focus propio siguen cubiertos por reset.css:15, o sea el defecto es de coherencia, no de a11y. Lo declara el mismo, honesto.

## [MEDIO] Cuatro tecnicas de slider, dos acentos distintos con la misma tecnica, y la mas elaborada solo funciona en WebKit

- RECONTADO Y EXACTO: grep de 'accent-color:' en todos los .css devuelve exactamente 3 resultados, con TRES valores distintos. PropertiesPanel.css:184 `var(--accent)` (indigo), CollisionBodyPanel.css:139 `#4a9eff` (azul a mano), ReferenceImageSettings.css:125 `var(--accent, #4a9eff)`.
- 1. PropertiesPanel.css:181 (.panel-slider) CONFIRMADO en la linea exacta, con accent-color en 184.
- 2. CollisionBodyPanel.css:136 (.cb-slider-row input[type=range], height 3px) CONFIRMADO en la linea exacta.
- 3. ReferenceImageSettings.css:121 (.ref-img-slider, height 2px) CONFIRMADO en la linea exacta.
- 4. AvatarPanel.css:223 (-webkit-appearance:none, height 4px, background var(--border-color,#444)) y :233 (::-webkit-slider-thumb 10x10 redondo con var(--accent,#007acc)) CONFIRMADOS en lineas exactas.
- RECONTADO Y EXACTO: grep de 'moz-range' en todo el CSS y TSX del repo devuelve CERO resultados. El equivalente Firefox no existe.
- Los 3 grosores de pista distintos (nativo, 3px, 2px, 4px) CONFIRMADOS, en realidad son 4 contando el del punto 4.
- La propagacion del slider 4 a las 5 secciones del panel de Render CONFIRMADA (misma evidencia del hallazgo 1).

> **Nota del verificador:** Todas las lineas y el cero de moz-range son exactos. CONTEXTO ATENUANTE QUE EL AUDITOR NO VIO, y que baja la prioridad del sub-punto de Firefox: el proyecto es Chromium-first de hecho. playwright.config.ts:34-39 declara UN solo project, 'chromium'; no hay browserslist en package.json; y CLAUDE.md documenta que WebGPU es el tier por defecto desde #897, algo que en la practica exige Chromium. O sea el thumb roto en Firefox es real pero no toca a Maria hoy. Lo que si toca es la parte que sobrevive intacta: cuatro tecnicas y tres valores de acento para el mismo control, con la version mas fragil justamente propagada a las 5 secciones del panel de Render. Correccion menor: '12 consumidores' de .panel-slider, reconte 11 ocurrencias en .tsx, en los 3 archivos que el auditor nombro correctamente (MaterialTab, PieceProperties, SeamPropertiesPanel).

## [MEDIO] Primario significa dos cosas contradictorias: relleno de acento en unos paneles, contorno de acento en otros

- RELLENO 1: NotchPrecisionModal.css:85 `.primary { background:var(--accent); border-color:var(--accent); color:#fff; }` CONFIRMADO en linea exacta.
- RELLENO 2: AvatarPanel.css:170 `.ap-btn.accent` con background y border-color en 171-172 usando var(--accent,#007acc), color:#fff. CONFIRMADO.
- RELLENO 3 no citado por el auditor: CalibrationModal.css:74 tambien es relleno solido (#0078d4), o sea son tres rellenos, no dos.
- CONTORNO: PropertiesPanel.css:265 `.panel-btn-primary { width:100%; background:transparent; border:1px solid var(--accent-border); color:var(--accent); }` CONFIRMADO en linea exacta, con hover --accent-subtle en :279-282.
- CONTORNO PUNTEADO: CollisionBodyPanel.css:54 `.cb-import-btn { background:rgba(74,158,255,0.15); border:1px dashed rgba(74,158,255,0.4); border-radius:6px; color:#4a9eff; }` CONFIRMADO en contenido; el auditor cito :55, la regla abre en :54.
- CONTORNO SOLIDO: ReferenceImageSettings.css:9 `.ref-img-import-btn { background:rgba(74,158,255,0.12); border:1px solid rgba(74,158,255,0.3); border-radius:5px; color:var(--accent,#4a9eff); }` CONFIRMADO en linea exacta.
- El punto mas fino del hallazgo CONFIRMADO: las dos CTA de importar archivo, mismo rol exacto, usan el MISMO azul rgba(74,158,255) con alfas distintas (0.15/0.4 vs 0.12/0.3), radios distintos (6px vs 5px) y estilos de borde distintos (dashed vs solid). Ese par no admite justificacion de rol.

> **Nota del verificador:** Confirmado. Una linea corrida en una cita (CollisionBodyPanel.css:54, no :55) y por lo demas todo exacto. Contexto que el auditor no dio y que matiza a la baja una parte: PropertiesPanel.css:265 es un boton de ancho completo dentro de un panel lateral estrecho, donde un relleno solido de acento a 100% de ancho seria un bloque de color desproporcionado. O sea el contorno ahi tiene una razon plausible de densidad, no es puro capricho. Lo que NO tiene defensa es el par de importar (cb-import-btn vs ref-img-import-btn): mismo rol, mismo azul, tres divergencias gratuitas.


---

# Refutados (el verificador los tumbó)

## Sub-afirmación del hallazgo 4: '--accent-subtle (0.13) y --accent-border (0.27) tienen CERO consumidores'

Falso, y es el argumento que el propio auditor llama 'el dato más duro'. Recuento propio: `var(--accent-subtle)` tiene 9 consumidores (PropertiesPanel.css:261, :281, :343, :347; Dock.css:56; base.css:54; y más) y `var(--accent-border)` tiene 5 (PropertiesPanel.css:270, :348; RenderSettingsPanel.css:86; base.css:54; unified-bar.css:91). Lo que el auditor midió fue otra cosa: que los literales rgba(99,102,241,0.13) y (…,0.27) solo aparecen una vez cada uno, o sea en su propia definición — que es exactamente lo CORRECTO en un design system. Confundió 'nadie copia el literal' con 'nadie usa el token', y de ahí dedujo que el sistema fue ignorado cuando la evidencia dice lo contrario.

## Sub-afirmación del hallazgo 3: '--panel-bg, --color-error y --color-warning solo se alcanzan vía fallback con OTRO valor, así que la definición nunca gana'

Al revés: en CSS el segundo argumento de var() solo se usa cuando la variable NO está definida. Los tres están definidos en el :root de src/App.css:16, :26 y :27, y App.css se importa vivo (src/App.tsx:9). Entonces la definición gana SIEMPRE y el fallback es inalcanzable. Consecuencias: el 'tercer amarillo' de ConnectionCard.tsx:160 (#ca8a04) y el 'segundo rojo' de UnifiedBarChat.tsx:303 (#f87171) no se pintan nunca — son código muerto. Y --panel-bg se consume con fallback #1e1e1e en BOMTab.css:108/:162 y GradingTab.css:95/:135, que es su MISMO valor, no otro. La afirmación de que el comentario de App.css:9-12 'es falso hoy' se apoya en este error de mecánica.

## Sub-afirmación del hallazgo 6: '#4a9eff con 32 usos es más frecuente que el acento oficial; medido por volumen, el design system perdió'

La comparación está mal planteada: contrasta un literal contra otro literal, cuando el acento oficial se consume por token. Recuento propio: `var(--accent)` tiene 53 usos, `var(--accent-2d)` 20, `var(--accent-subtle)` 9, `var(--accent-border)` 5, `var(--accent-hover)` 4 — más de 90 consumos del acento canónico vía sistema, contra 34 literales de #4a9eff (23 en .tsx/.ts excluyendo tests, más 11 en .css; el auditor reportó 21+11=32, subcontó). Medido por volumen el design system va ganando cómodo. Lo que sí queda es que #4a9eff es el segundo azul más extendido del repo y sigue sin decidirse, pero eso es un pendiente, no una derrota. El resto del hallazgo 6 sí lo confirmé: las 15 líneas de acentos existen tal cual, y la contradicción de regla en InspectorTab.css:129 (#6366f1) → :140 (#5558e6, más oscuro) frente a tokens.css:16-17 (#6366f1 → #818cf8, más claro) es real, aunque la 'regla' del sistema es implícita en el par de tokens, nunca está escrita.

## Cuatro escaladas documentadas en comentarios, y el gemelo geométrico del panel que escaló se quedó con el valor perdedor

No refuto los datos —todas las citas son exactas: RenderSettingsPanel.css:11-13 lleva el comentario de la escalada y `z-index: 30`; CollisionBodyPanel.css:1-11 tiene geometría idéntica (absolute, top:0, right:0, width:280px, height:100%) y se quedó en `z-index: 20`; SurfaceModePill.css:8 es `z-index: 25`; Viewport3D.tsx monta los tres como hermanos en :967, :1000 y :1009, con el pill después del cb-panel en el DOM; floating.css:96/172 son 200/210 y SubMenu.css:24 vs floating.css:180 son 1010/1000; ToolTooltip.css:7 es 10000 contra SolverMetrics.css:9 en 9999. Refuto el HALLAZGO como pieza independiente, por dos razones. PRIMERA: su exhibit central es código muerto, y el propio auditor lo admite en la nota honesta — verifiqué su cadena y es peor de lo que dice. El único disparador de `collisionPanelOpen` es el botón de Viewport3D.tsx:978, gateado tras `!hideChrome`, y AppShell.tsx:284 monta `<Viewport3D hideChrome />`; grep confirma que `setCollisionPanelOpen(true)` no se llama desde ningún otro sitio. El cb-panel NUNCA puede abrirse en el shell real, así que 'el gemelo se quedó con el valor perdedor' describe una pelea que no puede ocurrir. Un hallazgo cuyo caso demostrativo es inalcanzable no sostiene severidad ALTO. SEGUNDA: lo que sí queda vivo —los pares 200/210, 1000/1010 y 9999/10000— es exactamente la misma evidencia que el hallazgo 1 ya presenta como síntoma de la ausencia de escala, y no añade un eje nuevo: es una instancia del mismo mecanismo, no un segundo mecanismo. Su regla de contrato ('ningún z-index sube para ganar una pelea concreta') es un corolario de la escala cerrada que el hallazgo 1 ya pide. Sumado a que dos de las tres 'escaladas' vivas (1010 vs 1000 y 10000 vs 9999) están además contaminadas por el punto que refuté en el hallazgo del apilamiento —SolverMetrics.tsx:36-38 lo hace dev-only, así que el 10000 no le gana a nada en producción— lo que queda es un solo par real (200/210 vs 1000/1010) sin impacto observable. Absorber en el hallazgo 1 como evidencia; no listar aparte.

## Tres archivos esquivan la posición POR DEFECTO de una barra que el usuario puede arrastrar a cualquier parte

Refutado por cita selectiva: el auditor truncó el comentario que es su prueba principal y lo que omitió dice justo lo contrario de su tesis. El texto completo en src/styles/floating.css:7-9 es «Por encima del UnifiedBar en su posición default (58px alto + 24px de offset, barPosition.ts) — a bottom:12 quedaba recortado DETRÁS del bar (Fase1-S3). SI EL USUARIO ARRASTRA EL BAR, ESE ES SU LAYOUT.» El auditor cortó la cita justo antes de esa última frase. Su narrativa es que «dos decisiones de dos ráfagas distintas se contradicen» y que los autores «no se leyeron entre sí»; el comentario demuestra que el autor de esa línea SÍ leyó barPosition.ts, SÍ consideró el caso del arrastre y documentó la decisión de no compensarlo. Eso es un tradeoff escrito, no una colisión inconsciente — que es precisamente la distinción sobre la que descansa la tesis del dueño. Segundo error, aritmético: el título dice 'tres archivos' y la evidencia lista DOS (floating.css, contado dos veces en :10 y :24, y SnapshotBar.css:5). Tercero, la mitad más grave que reclama —«arrastrada a cualquier lado, la barra los tapa a todos» con z-100— es cierta pero es literalmente el hallazgo 1 otra vez (ausencia de escala), no un hallazgo sobre la barra. Lo único que sobrevive limpio es SnapshotBar.css:3-5, que copia el mismo 94px SIN el reconocimiento del tradeoff, y floating.css:24, cuyo `max-height` reserva altura asumiendo la barra abajo. Eso es un caso, en dos líneas, de severidad MEDIO — y ya está cubierto como compensaciones 1 y 2 del hallazgo de oclusión, que sí cita las seis. Como hallazgo ALTO independiente no se sostiene.

## Tres paneles anclados a la derecha compitiendo en el mismo contexto de apilamiento con tres z-index distintos, y ninguno sabe de los otros

Las CITAS son todas exactas — verifiqué CollisionBodyPanel.css:1-11 (z20), floating.css:19-30+35-38 (.context-panel z25), RenderSettingsPanel.css:2-14 (z30 con su comentario en 11-12), SurfaceModePill.css:1-9 (z25 con su comentario en 4-6), layout.css:69-72 y Viewport3D.css:1-7 (ninguno crea contexto de apilamiento: position:relative con z-index auto), y Viewport3D.tsx:983 con el número mágico 290. Pero el HALLAZGO tal como está titulado y argumentado es falso en sus dos afirmaciones centrales. (1) NO son tres paneles: son DOS. Tracé la única vía de apertura de CollisionBodyPanel — `setCollisionPanelOpen(true)` aparece una sola vez en todo el repo, en Viewport3D.tsx:995, dentro del bloque `{!hideChrome && (` de la línea 978. Y AppShell.tsx:284 monta `<Viewport3D activeTool3D={...} hideChrome />`, que es el ÚNICO montaje de Viewport3D en el repo (grep de `<Viewport3D` → 1 resultado). El botón CB nunca renderiza, no hay ningún dispatch ni atajo alternativo, y el panel de Collision Bodies es una superficie oscura: hoy es inalcanzable. El propio repo documenta este patrón para el panel hermano en renderSettingsThunk.ts:4-5 («su único opener era un botón gateado por !hideChrome que jamás renderizó en el shell actual, dark surface, audit Vex 2026-07-16») — al de Render le pusieron puerta nueva, al de CB no. (2) El escenario de fallo que el hallazgo pone al usuario — «Si la usuaria abre Propiedades (z25) con Collision Bodies (z20) abierto, uno se come al otro sin aviso» — es IMPOSIBLE: María no puede abrir Collision Bodies. Y el número mágico 290 vive dentro de ese mismo botón muerto, así que tampoco tiene efecto observable. Lo que SÍ sobrevive, y merece reescribirse como hallazgo aparte más pequeño: dos paneles reales (context-panel z25 y render-panel z30) sí compiten en el contexto raíz, sí están ambos anclados a la derecha, y con la vista en 3D-only el drawer de Render (z30) tapa a Propiedades (z25) sin que ninguno sepa del otro. Eso es MEDIO/BAJO y no necesita el adorno de la tercera pieza. Regla general que el dueño debe extraer: en este repo, ANTES de contar superficies hay que verificar que se alcanzan — cuatro celdas de otro hallazgo cayeron por lo mismo (CB, botón CB, .viewport3d-avatar-toggle sin consumidores, SolverMetrics dev-only).

## Sub-afirmación del hallazgo 8: «la ráfaga siguiente tocó ese mismo archivo (autoSewThunk.ts, para añadir Re-coser) sin leer el spec ni arreglar las tres líneas de al lado»

La cronología está invertida. `git log -S "Re-coser" -- src/store/autoSewThunk.ts` devuelve exactamente dos commits: ed28f9ca (2026-07-05, «SEAM_ENGINE_VERSION + toast Re-coser») y 612bec1d (2026-07-10, «Re-coser es UN paso de undo»). Los dos son ANTERIORES al glosario, fechado 2026-07-16. Y `git log -3 -- src/store/autoSewThunk.ts` confirma que 612bec1d (2026-07-10) es el ÚLTIMO commit que tocó el archivo: ninguna ráfaga posterior al glosario pasó por ahí. Nadie escribió 'Re-coser' al lado de los 'Auto-sew:' ignorando un spec que todavía no existía. El hallazgo padre sigue en pie por otra vía —la unificación está ordenada por escrito desde hace un mes y las tres cadenas de autoSewThunk.ts:85/:88/:91 siguen intactas—, pero eso prueba OMISIÓN (el glosario ordenó y nadie volvió al archivo), no la tesis de «ráfagas que se pisan sin leerse». La distinción importa porque el remedio es distinto: aquí no hace falta un contrato que impida colisiones, hace falta que el spec tenga un test rojo detrás.

## Sub-afirmación del hallazgo 9: «el SeamPropertiesPanel ya demuestra el problema hoy, porque el nombre de pieza interpolado depende del CSS mientras la palabra COSTURA: no»

Hoy no se ve ninguna mezcla. PropertySection.tsx:19 mete el `title` COMPLETO —literal e interpolación— dentro de un solo `<span className="panel-title">`, y PropertiesPanel.css:50 aplica `text-transform: uppercase` a ese span entero. El nombre de pieza se pinta en mayúsculas igual que la palabra 'COSTURA:', así que el título renderiza uniforme. Lo que existe es una doble fuente de verdad que se rompería si alguien quita el text-transform —eso el propio auditor lo dice bien en la frase anterior—, pero la afirmación de que el defecto es observable «hoy» es falsa y no resiste abrir el componente. El hallazgo padre queda confirmado en su parte estructural.

## «Escalado: early return SIN clase de vacío» (sub-afirmación del hallazgo de estados vacíos)

Falso, verificado leyendo el archivo. GradingTab.tsx:284 renderiza `<div className="grading-empty">` y la clase está definida en GradingTab.css:166-172. El auditor no solo se equivocó: se le escapó un vocabulario entero, así que su propio conteo de «9 vocabularios» debería ser 10. Y peor para su tesis (o mejor): `.grading-empty` es byte por byte idéntica a `.bom-empty` (BOMTab.css:210) y `.nesting-empty` (NestingTab.css:118) — son TRES copias literales, no dos. Lo único cierto de esa celda de la tabla es que el early return repinta la toolbar completa.

## «Un usuario de teclado queda encerrado en ConnectionModal y no puede cerrar el diálogo»

Falso. ConnectionModal.tsx:180-186 es un `<button type="button" onClick={props.onClose} aria-label="Cerrar">✕</button>` nativo: alcanzable con Tab y activable con Enter o Espacio. El propio auditor lo cita («o la ✕ de la línea 184») y aun así concluye que solo se puede cerrar con el ratón. El defecto real —sin Escape, sin trampa de foco, sin aria-modal, con la app de atrás interactiva— está confirmado y se sostiene solo; la consecuencia dramatizada no.

## «Censo de aria-*: 74 atributos en src/**/*.tsx (sin tests)»

Falso, recontado dos veces. Sobre .tsx excluyendo __tests__ y *.test.tsx el total es 64: aria-label 47, aria-pressed 8, aria-hidden 6, aria-expanded 2, aria-live 1. El 74 sale de contar los archivos de test, exactamente lo que el auditor declaró excluir (incluyéndolos, y sumando .ts, da 75). Su propio desglose además no suma 74 sino 71. La conclusión que cuelga del censo (una sola aria-live en todo el proyecto) sí es verdadera y la verifiqué aparte.

## «Los 63 sitios fantasma siempre resuelven al hex de fallback»

Falso en un sitio de los 63. DynamicProviderForm.tsx:141 es `var(--text-accent, var(--accent, #6366f1))`: su fallback es el token REAL del sistema, así que ese pinta el índigo correcto, no un hex rogue. Son 62 los que pintan hex crudo. El resto del censo lo reconstruí desde cero con otro método y coincide dígito por dígito (9 fantasmas, 63 call sites, 25/16/7/5/3/3/2/1/1).

## «LogoMenu.tsx:43 debería usar showUndoToast, que ya existe para ese tipo de acción» (regla propuesta del hallazgo de diálogos nativos)

Falso como remedio para ESE sitio. LogoMenu.tsx:44 hace `void clearStorageProject().finally(() => window.location.reload())`: la página se recarga, el store de Redux se destruye y con él el toast y su actionPayload. Un showUndoToast ahí no puede deshacer nada porque no sobrevive al reload. Ese caso concreto necesita la opción (b) de la propia regla, el `<ConfirmDialog>`. La regla sigue siendo buena para los otros seis sitios.

## SUB-AFIRMACION del hallazgo 7: en FloatingActionBar el foco es imposible por construccion

src/styles/reset.css:15 declara `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }` como selector global, sin acotar a ninguna clase. El estilo inline de FloatingActionBar.tsx:92-104 declara background, border, borderRadius, color y cursor, pero NO toca `outline`. Por lo tanto la regla global se aplica y el anillo de foco SI se pinta al navegar con teclado. El estilo inline gana en especificidad solo sobre las propiedades que declara; outline no es una de ellas. Los estilos inline no pueden expresar pseudo-clases, pero eso no impide que una regla global de pseudo-clase alcance al elemento.

## SUB-AFIRMACION del hallazgo 7: pasar el mouse sobre las acciones de la pieza no produce absolutamente ninguna respuesta visual

src/components/PatternEditor/FloatingActionBar.tsx:87 envuelve cada boton en `<ToolTooltip key={def.id} name={label} shortcut={def.shortcut}>`. Al pasar el mouse aparece un tooltip con el nombre de la accion y su atajo de teclado. Es cierto que el boton en si no cambia de fondo, pero 'absolutamente ninguna respuesta visual' es falso y exagera el impacto para Maria.

## SUB-AFIRMACION del hallazgo 3: en AvatarPanel.css el token --bg-secondary no existe

src/App.css:15 define `--bg-secondary: #242424;` dentro del bloque :root legacy. El token SI existe y resuelve. Lo que si es cierto de esa linea es otra cosa, mas fina y que el auditor no dijo: el fallback escrito en AvatarPanel.css:154 es #2a2a2a mientras el valor real del token es #242424, o sea el fallback documenta un valor equivocado del propio token. De los tres var() de esa regla solo --border-color es realmente inexistente. Esto no toca el conteo de 59, que verifique exacto: --bg-secondary nunca estuvo en la lista de los 8.

## SUB-AFIRMACION del hallazgo 9: cobertura de estados medida en 67 selectores con forma de boton (:hover 39, :disabled 10, :focus-visible propio 3)

No es reproducible. Mis conteos independientes sobre todo el CSS de src/ dan 76 lineas con :hover, 18 con :disabled, y 5 reglas :focus-visible fuera de reset.css (EmptyState2D.css:51, :87, :115 y Dock.css:50, :125), no 3. El recorte a '67 selectores con forma de boton' no esta definido de forma que se pueda re-medir, asi que las tres cifras quedan sin respaldo. Ojo: esto NO refuta el hallazgo, cuyo nucleo (cero :active de pulsado en botones) verifique de forma exhaustiva y es exacto; refuta solo el desglose de cobertura que lo acompaña.

## SEVERIDAD BLOQUEANTE de los hallazgos 1 y 2

Ninguno de los dos rompe uso real, que es la definicion de BLOQUEANTE en este encargo. En el 1, si Maria abre Render sin haber abierto Avatar, los input[type=range] pierden layout flex, alto de pista, thumb y el ancho del numerico, pero siguen siendo controles nativos plenamente arrastrables y escribibles: queda feo, no roto. En el 2, el atributo disabled es real (NestingTab.tsx:290) y ademas hay guard defensivo en el handler (NestingTab.tsx:113), o sea no hay corrupcion de estado ni accion fallida silenciosa a nivel de datos: lo que falta es la señal visual, y solo en el estado borde de cero piezas activas. Ambos son ALTO (deriva sistemica con consecuencia visible), no BLOQUEANTE.

