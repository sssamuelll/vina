# Fase 3+4 del contrato de interfaz: emplazamiento y modelo de paneles — diseño

**Estado:** aprobado por secciones en brainstorming, pendiente de tu revisión final de este documento.

**Origen:** `docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md`, secciones 4.2 (causa raíz: el cromo flota encima del documento), 5.2 (ley de emplazamiento), 5.4 (ley de puertas) y 6 (Fases 3 y 4 del plan). Contrato vigente: `.claude/skills/contrato-de-interfaz/`. Guardián: `scripts/ui-contract-lint.mjs`.

## 1. Qué hay hoy, medido

- `LeftDock`, `RightDock` y `ContextPanel` son `position: absolute`/`fixed`, flotan **encima** del lienzo. El "ajustar a la vista" (`computeFitView`, `PatternEditor.tsx:672`) mide `svg.getBoundingClientRect()` — un rectángulo que **no sabe** que hay cromo tapando parte de lo que mide.
- `UnifiedBar` es `position: fixed`, cruza el divisor 2D/3D en modo Split.
- Los 7 paneles (`Avatar`, `BOM`, `Grading`, `Inspector`, `Nesting`, `Layers`, `Properties`) comparten **una sola ranura** (`contextPanel: string | null` en `AppShell.tsx:84`). Abrir uno cierra cualquier otro, incluso si están en lados distintos.
- `panelSide.ts` ya clasifica cada panel como `'left' | 'right'` (`Grading`, `Properties` → izquierda; el resto → derecha). Esta clasificación no cambia.
- Cinco sitios llaman `onOpenPanel`: `TopBar` (vía `LogoMenu`), `LeftDock`, `RightDock`, `UnifiedBar` (paleta de comandos), y `PatternEditor` (tres llamadas: selección de pieza/borde/vértice). Cuatro alternan (`prev === name ? null : name`); `PatternEditor.tsx:271` no alterna — **a propósito, no es bug**: la selección en el lienzo debe *garantizar* que Propiedades esté abierto, nunca cerrarlo a mitad de una edición. Corrección a mi propio informe del 2026-08-14, que había leído esto como inconsistencia.
- El visor 3D **ya** reacciona solo a que su contenedor cambie de tamaño (`ResizeObserver` en `Viewport3D.tsx:717` + `resize` de react-three-fiber). No hace falta tocarlo.
- 41 `z-index` literales. Verificados uno por uno, uno a uno con su valor real (el listado de `ui-contract-lint.mjs --list R8` trunca el valor mostrado a un dígito — bug del propio linter, se corrige en esta fase; y el recuento de "41" del linter incluye una línea en blanco de formato, el total real de sitios es 41 exactos una vez descontada). Se dividen en dos grupos reales, no uno:
  - **14 compiten en el espacio global** de verdad (docks, barras, paneles, menús, modales, toasts).
  - **26 son orden relativo dentro de un solo componente** (la barra de mapas de ajuste, el crosshair, popovers de Capas, un control flotante propio de `RightDock` sobre el visor 3D, un segundo aviso de soltar-DXF local a `UnifiedBar`, etc.) — compiten con el resto de la app solo porque `isolation: isolate` no se usa **en ningún lado** del proyecto (medido en la auditoría: 0 ocurrencias).
  - **1 más** (`.canvas-area__divider`) se resuelve aparte, en 2.4.
- 7 archivos de test y 4 specs e2e ya asumen la forma actual del estado (`contextPanel`/`onOpenPanel`): `PatternEditor.seamAllowanceExactWidth.test.tsx`, `PropertiesPanel.rehome.test.tsx`, `Dock.test.tsx`, `LogoMenu.test.tsx`, `RightDock.test.tsx`, `unifiedBarCommandGroups.test.tsx`, `renderSettingsThunk.test.ts`; y `bundle-split.spec.ts`, `command-palette.spec.ts`, `ik-solver.spec.ts`, `morph-weights.spec.ts`.

## 2. Qué cambia

### 2.1 Layout real (canaletas)

`canvas-area` pasa a ser una fila con hasta cinco hijos reales, en este orden:

```
canvas-area
├─ panel izquierdo?  (300px, si hay uno abierto — Properties/Grading)
├─ canvas-area__2d   (fila interna: LeftDock | PatternEditor)
├─ divisor?          (solo en modo Split)
├─ canvas-area__3d   (fila interna: Viewport3D | RightDock)
└─ panel derecho?    (300px, si hay uno abierto — Avatar/BOM/Inspector/Nesting/Layers)
```

`LeftDock`/`RightDock` dejan de ser `position: absolute` (con el truco `top:50%; transform:translateY(-50%)` para centrar) y pasan a ser hijos flex reales de `canvas-area__2d`/`__3d`, centrados con `align-items: center` en el contenedor. Visualmente no cambian — su material (`chrome`, ya definido en la Fase 2) no se toca.

`ContextPanel` deja de ser `position: absolute` con offset (`top/right: var(--sp-3)`) y pasa a ser un hijo flex real de `canvas-area`, con ancho fijo (300px). Conserva su material `overlay` (fondo, blur, borde, sombra, radio) — cambia el *mecanismo* de posición, no el aspecto.

`UnifiedBar` deja de ser `position: fixed` y pasa a ser una fila real al fondo de `.app-shell` (que ya es `display:flex; flex-direction:column`), igual que `TopBar` arriba. Consecuencia: nunca puede volver a cruzar el divisor 2D/3D, porque ya no comparte espacio con `canvas-area` — vive debajo de ella en el flujo normal.

**Riesgo de implementación conocido, no oculto:** el contenedor del SVG dentro de `PatternEditor` (hoy ocupa el 100% del ancho de `canvas-area__2d` porque es el único hijo real junto al dock absoluto) necesita `flex: 1; min-width: 0;` para no desbordar el nuevo layout flex — el `min-width: 0` es la trampa clásica de flexbox con contenido ancho (un SVG) que si no se declara, el hijo se niega a angostarse y el layout completo se rompe. Se verifica en el primer task de implementación, con captura antes/después.

Lo que **sigue siendo overlay a propósito** (excepción explícita del contrato — "solo tres cosas pueden taparlo: menús transitorios, toasts y la paleta de comandos"): el aviso de soltar-DXF, menús contextuales, tooltips, submenús, `ConfirmDialog`, `ToastContainer`, `Ctrl+K`. Ninguno de estos cambia de mecanismo de posición en esta fase.

### 2.2 Modelo de paneles: dos ranuras, dos operaciones

`contextPanel: string | null` se reemplaza por un hook propio, `usePanelHost()` (nuevo, `src/hooks/usePanelHost.ts`), que expone:

```ts
interface PanelHost {
  leftPanel: string | null;
  rightPanel: string | null;
  openPanel: (name: string) => void;   // garantiza abierto; nunca cierra
  togglePanel: (name: string) => void; // abre si cerrado, cierra si abierto
  closePanel: (name: string) => void;  // cierra si es el que está abierto de ese lado
}
```

Las tres operaciones enrutan solas al lado que le toca a `name` vía `getPanelSide()` (sin cambios). `getPanelSide` sigue siendo la única fuente de verdad de qué panel va a cuál lado.

Quién llama qué:
- `TopBar`/`LogoMenu`, `LeftDock`, `RightDock`, `UnifiedBar` (paleta de comandos) → `togglePanel` (comportamiento actual, se conserva).
- Las tres llamadas dentro de `PatternEditor` (selección de pieza/borde/vértice) → `openPanel` (nunca debe cerrar Propiedades a mitad de una edición).
- `ContextPanel`'s botón de cerrar y Escape → `closePanel`.

Alcance explícito: esto resuelve el caso medido (Capas a la derecha + Propiedades a la izquierda, conviven). **No** resuelve que dos paneles del mismo lado convivan (Avatar + BOM, los dos derecha) — eso sigue siendo exclusivo. Un sistema de pestañas/stack por ranura queda fuera de esta fase; se revisita solo si se pide explícitamente.

### 2.3 Escala de z-index: completar lo que falta

**Grupo 1 — global (14 sitios). Trece migran a los tokens ya definidos en `tokens.css`; uno se elimina porque deja de hacer falta:**

| Archivo | Hoy | Pasa a | Nota |
|---|---|---|---|
| `Dock.css:7` | 5 | `var(--z-dock)` | ya coincide en valor |
| `layout.css:18` (`.top-bar`) | 10 | `var(--z-bar)` | mismo rol que UnifiedBar |
| `unified-bar.css:5` | 100 | `var(--z-bar)` | ya coincide en valor |
| `AppShell.tsx:240` (aviso soltar-DXF) | 50 | `var(--z-hint)` (**token nuevo**, 200) | rol propio: overlay transitorio de arrastre |
| `floating.css:35` (`.context-panel`) | 25 | **se elimina** | `z-index` solo aplica a elementos posicionados; al dejar de ser `position:absolute` (2.1) la propiedad ya no hace nada. `--z-panel` sigue vivo: lo hereda `SolverMetrics` un poco más abajo en esta misma tabla. |
| `floating.css:103` (menú del logo) | 200 | `var(--z-menu)` | ya coincide en valor |
| `floating.css:180` (submenú del logo) | 210 | `var(--z-menu)` + 10 | anidado, un nivel arriba de su padre |
| `ConnectionModal.tsx:42` | 200 | `var(--z-modal)` | **reclasificado**: tiene velo (`inset:0`), es modal de verdad, no menú |
| `floating.css:188` (menú contextual) | 1000 | `var(--z-context-menu)` | ya coincide en valor |
| `SubMenu.css:24` (submenú del menú contextual) | 1010 | `var(--z-context-menu)` + 10 | anidado |
| `CalibrationModal.css:8` | 1000 | `var(--z-modal)` | **reclasificado**: tiene velo, compartía nivel con el menú contextual |
| `NotchPrecisionModal.css:9` | 1000 | `var(--z-menu)` | **reclasificado a la baja**: el propio archivo dice *"deliberately no scrim/backdrop"* — no es modal aunque el nombre lo diga |
| `SolverMetrics.css:9` | 9999 | `var(--z-panel)` | el 9999 era pánico, no necesidad real |
| `ToolTooltip.css:7` | 10000 | `var(--z-toast)` | un tooltip sí necesita ganarle a todo mientras se muestra |

`layout.css:47` (`.canvas-area__divider`, hoy en 5) **no está en esta tabla a propósito** — es el sitio aparte que la sección 1 cuenta fuera de los 14, y se resuelve en 2.4, no con un token de esta escala.

Solape de baja severidad, dicho explícitamente: `NotchPrecisionModal` y el menú del logo quedan en el mismo nivel (`--z-menu`). En la práctica no coexisten (uno se abre desde una herramienta del lienzo, el otro desde el logo, y el logo se cierra solo al hacer clic afuera). Si algún día chocan, gana el que esté después en el DOM. No se resuelve con un token nuevo porque sería un rol de uno solo — se documenta y se sigue.

**Grupo 2 — local (26 sitios):** se les agrega `isolation: isolate` a su contenedor. Los archivos: `FitMapToggle`, `PanCrosshair`, `SelectionOverlay`, `SimulationStatusOverlay`, `Viewport3D` (en sus dos overlays propios), `FloatingActionBar`, `BOMTab`, `GradingTab`, `LayerPanel`, `EmptyState2D`, `AvatarPanel`, `CollisionBodyPanel`, `RenderSettingsPanel`, `SnapshotBar`, `SurfaceModePill`, y dos que no había nombrado en la primera pasada de este documento: `RightDock` (el control `.floating-3d`, un botón que flota sobre el visor 3D con el mismo rol que `SurfaceModePill`) y `UnifiedBar` (un segundo aviso de soltar-DXF, local a la barra e independiente del que ya tiene `AppShell.tsx`).

Sus valores pequeños (1–90) se extraen a variables CSS **locales al propio archivo** (p. ej. `.fit-map-toggle { --capa-barra: 1; --capa-escala: 2; }`), no a la escala global — la regla del contrato se cumple (ningún literal suelto) sin inflar la escala compartida con roles que nadie más usa.

`CalibrationModal` también gana `isolation: isolate`, aunque no tenga un segundo z-index local hoy: es la superficie más "modal" del grupo (tiene velo, bloquea), y aislar su propio subárbol evita que cualquier control que se le agregue después necesite pedir permiso a la escala global.

Nota sobre `LayerPanel`: su menú contextual (`.layer-context-menu`) es `position: fixed`, no `absolute` — pero un `isolation: isolate` en el contenedor del panel sí lo contiene para efectos de apilamiento (la especificación de CSS trata `position: fixed` como contenido por el ancestro más cercano que establece contexto de apilamiento, aunque su posición visual siga calculándose contra el viewport). No necesita escapar a la escala global.

### 2.4 `.canvas-area` como límite de aislamiento

`.canvas-area` gana su propio `isolation: isolate`. Con eso, `.canvas-area__divider` (hoy z:5) deja de necesitar un rol global — es orden local dentro de ese límite, igual que el Grupo 2.

## 3. Archivos que toca

**Nuevo:**
- `src/hooks/usePanelHost.ts` + `src/hooks/__tests__/usePanelHost.test.ts`

**Modificado — layout:**
- `src/components/shell/AppShell.tsx` — reemplaza `contextPanel`/`setContextPanel` por `usePanelHost()`; reestructura el JSX de `canvas-area` con las cinco posiciones de 2.1; los cinco sitios de apertura usan `openPanel`/`togglePanel` según 2.2; el aviso de soltar-DXF usa `var(--z-hint)`.
- `src/components/shell/ContextPanel.tsx` + `.css` — de tarjeta flotante con offset a hijo flex real; usa `closePanel`.
- `src/components/shell/DockShell.tsx` + `Dock.css` — el envoltorio compartido de verdad (lo usan `Dock.tsx` del lado 2D **y** `RightDock.tsx` del lado 3D, verificado leyendo el código, no asumido): de `position:absolute` a hijo flex, centrado por el contenedor.
- `src/styles/layout.css` — `.canvas-area` gana `isolation:isolate`; `.canvas-area__2d`/`__3d` pasan a `display:flex`; `.top-bar` migra su z-index.
- `src/styles/unified-bar.css` — quita `position:fixed`, migra z-index.
- `src/styles/floating.css` — migra los z-index del menú del logo, su submenú y el menú contextual; `.context-panel` deja de usar `position:absolute` (pasa a ser un hijo flex, 2.1) y pierde su `z-index` (2.3).

**Modificado — z-index (Grupo 1, tabla de 2.3):** `src/components/shared/SubMenu.css`, `src/copilot/connections/ConnectionModal.tsx`, `src/components/PatternEditor/CalibrationModal.css`, `src/components/PatternEditor/NotchPrecisionModal.css`, `src/components/Debug/SolverMetrics.css`, `src/components/shell/ToolTooltip.css`.

**Modificado — aislamiento (Grupo 2):** `FitMapToggle.tsx`, `PanCrosshair.tsx`, `SelectionOverlay.tsx`, `SimulationStatusOverlay.tsx`, `Viewport3D.tsx`, `FloatingActionBar.tsx`, `BOMTab.css`, `GradingTab.css`, `LayerPanel.css`, `CalibrationModal.css`, `EmptyState2D.css`, `AvatarPanel.css`, `CollisionBodyPanel.css`, `RenderSettingsPanel.css`, `SnapshotBar.css`, `SurfaceModePill.css`, `RightDock.tsx` (el control `.floating-3d`), `UnifiedBar.tsx` (su propio aviso de soltar-DXF).

**Tokens nuevos** (`src/styles/tokens.css`): `--z-hint: 200;`.

**Herramienta:** `scripts/ui-contract-lint.mjs` — corrige el bug de truncamiento del valor mostrado en `--list`.

**Tests existentes a actualizar (ya localizados, no son sorpresa):** `PatternEditor.seamAllowanceExactWidth.test.tsx`, `PropertiesPanel.rehome.test.tsx`, `Dock.test.tsx`, `LogoMenu.test.tsx`, `RightDock.test.tsx`, `unifiedBarCommandGroups.test.tsx`, `renderSettingsThunk.test.ts`, y los specs e2e `bundle-split.spec.ts`, `command-palette.spec.ts`, `ik-solver.spec.ts`, `morph-weights.spec.ts`.

## 4. Verificación

**Con vitest (jsdom):**
- `usePanelHost`: `openPanel` nunca cierra; `togglePanel` sí; cada panel enruta al lado correcto; Capas y Propiedades pueden estar abiertos los dos a la vez; los cinco sitios llaman la operación que les toca.
- Lectura de CSS crudo (mismo patrón que `Dock.jerarquiaDeEstado.test.ts` de la Fase 1): las reglas que pasan a canaleta ya no declaran `position: absolute`/`fixed`; las que necesitan aislamiento declaran `isolation: isolate`.
- Roles de z-index correctos, no solo "sin literal": el modal por encima del menú contextual, el toast por encima del modal — usando el mismo linter (`ui-contract-lint.mjs`, regla R8 ya lo cuenta) más aserciones puntuales de orden entre los tokens que más importa que no se inviertan.

**Con el navegador, contra el DXF real de María (jsdom no calcula layout — `getBoundingClientRect()` da 0 siempre, esto no es opcional, es la única forma de verlo):**
- El ancho real del SVG baja al abrir un panel (medido antes/después, no solo "se ve bien").
- Capas y Propiedades conviven en pantalla a la vez.
- "Ajustar a la vista" encuadra sin que el panel tape nada, con un panel abierto.
- La barra de IA no cruza el divisor en modo Split.
- El toast sigue viéndose por encima de un modal abierto (no debe regresar el bug que se arregló en la Fase 1).

## 5. Orden de implementación

Un solo diseño, dos olas — no porque sean proyectos distintos, sino porque tienen perfiles de riesgo muy distintos y una depende poco de la otra:

1. **Ola 1 — z-index (2.3 y 2.4).** Mecánico, ~40 archivos, cada cambio es una línea. Sin riesgo visual: los valores migran uno a uno y `ui-contract-lint.mjs` certifica que ninguno queda suelto. Sale primero, en su propio PR, y deja el terreno limpio para la Ola 2.
2. **Ola 2 — canaletas y modelo de paneles (2.1 y 2.2).** El cambio arquitectónico de verdad, con riesgo visual real sobre el 2D de María. Sale después, verificado en el navegador contra su DXF real antes de mergear.

## 6. Fuera de alcance, a propósito

- Paneles múltiples del mismo lado (Avatar + BOM). Necesitaría pestañas o apilado — pieza de interfaz nueva, no solo re-plomería de layout. Se revisita si se pide.
- Breakpoints/diseño responsive de los paneles (300px fijo se mantiene). La auditoría lo señaló como hueco aparte; no es este alcance.
- Tocar el visor 3D — ya reacciona solo a los cambios de su contenedor.
