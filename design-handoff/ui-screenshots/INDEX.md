# OpenClo — capturas de UI/UX (handoff a diseño)

> Capturas pre-rename (2026): la UI mostrada dice "OpenClo"; el producto se llama Vina desde 2026-08-01.

Capturadas el **2026-05-31** contra la app en vivo (dev server local), viewport **1440×900**.
Cargadas con el **patrón DXF real de María**. Reflejan la UX que ships hoy, **no un mockup**.

El equipo va a replantear cómo se trabaja en la app — estas tomas son el punto de partida "tal cual está".

## Modelo de UI actual (para contexto)

- **TopBar** (arriba): logo/menú `OpenClo ▸`, undo/redo, switcher de vista `2D · Split · 3D`, estado del solver.
- **Canvas** (centro): a la izquierda el editor 2D de patrones con su barra de herramientas flotante; a la derecha el viewport 3D con el avatar y los pills `Arrange · Sew · Simulate`.
- **UnifiedBar** (abajo, flotante, arrastrable): la barra agéntica. Tres modos — **chat** ("Design with AI…"), **comandos** (⌘K, búsqueda → herramienta on-demand) y **settings**. Es el centro de la visión: la herramienta aparece cuando la pides, no en menús cargados.
- **ContextPanel** (lateral derecho, on-demand): Avatar, BOM, Grading, Inspector, Nesting, Layers.

## Capturas

| # | Captura | Qué muestra |
|---|---|---|
| 1 | `01-start-empty-2d.png` | Estado inicial — editor 2D vacío, antes de cargar nada. |
| 2 | `02-logo-menu-open.png` | Menú de la app (OpenClo ▸ File/Edit/View/Pattern/Simulation/Preferences/Help). |
| 3 | `03-pattern-loaded-2d.png` | Patrón real de María cargado (DXF). Vista Split por defecto. |
| 4 | `04-arrange-3d.png` | Vista 3D — prenda colocada sobre el avatar (arrange), derecha y de frente. |
| 5 | `05-sew-mode.png` | Modo costura manual activo (pill "Sewing…") — clic dos bordes para coser. |
| 6 | `06-simulate.png` | Simulación de tela corriendo sobre el avatar. |
| 7 | `07-split-view.png` | Vista dividida — 2D y 3D lado a lado. |
| 8 | `08-unified-bar-chat.png` | Barra unificada en modo chat — "Design with AI…" (UX agéntica). |
| 9 | `09-command-palette.png` | Paleta de comandos (⌘K) — búsqueda → herramienta on-demand. El catálogo completo. |
| 10 | `10-context-panel.png` | Panel lateral contextual (Layers) abierto desde ⌘K. |

## Notas honestas para el equipo (cosas que se ven en las tomas)

- **2D vacío tras cargar el DXF** (tomas 3 y 7): las piezas se ven colocadas en 3D, pero el editor 2D sale en blanco — no hace *zoom-to-fit* a las piezas importadas. Punto claro de fricción de onboarding.
- **Piezas amarillas sueltas** cerca del pecho/brazo en 3D: piezas pequeñas que el placement no acomodó bien. No es artefacto de las tomas, es estado real.
- Render 3D vía software (swiftshader), no GPU — colores/sombras pueden diferir levemente de lo que ve María en su máquina.
