# Fase 3+4 del contrato de interfaz: emplazamiento y modelo de paneles — diseño

**Estado:** aprobado por secciones en brainstorming; corregido después de una vuelta más con Samuel (ver nota al final de § 2.1) que **recorta** el alcance de las canaletas — solo los paneles de contenido las usan, los docks de herramientas y la barra de IA se quedan flotando tal como están, a propósito. Pendiente de tu revisión final de este documento.

**Origen:** `docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md`, secciones 4.2 (causa raíz: el cromo flota encima del documento), 5.2 (ley de emplazamiento), 5.4 (ley de puertas) y 6 (Fases 3 y 4 del plan). Contrato vigente: `.claude/skills/contrato-de-interfaz/`. Guardián: `scripts/ui-contract-lint.mjs`.

---

> ## ⚠️ Enmienda 2026-08-15 — el Grupo 2 (§ 2.3) y el aislamiento de `.canvas-area` (§ 2.4) quedan RETIRADOS
>
> Se implementaron y se sacaron del PR antes de mergear, tras un review adversarial. **La premisa era falsa y el documento contiene su propia refutación.**
>
> **Lo que este documento asume:** que ponerle `isolation: isolate` a un elemento saca su `z-index` de la competencia global, y que por eso 26 valores pequeños "solo parecían" competir.
>
> **Lo que hace CSS de verdad:** un elemento con `position` (no `static`) y `z-index` numérico **ya establece un contexto de apilamiento**. Agregarle `isolation: isolate` al MISMO elemento no cambia nada de cómo su propio `z-index` compite con sus hermanos — solo afecta a sus hijos. En ~20 de los 26 sitios la declaración quedó **inerte**: el literal se convirtió en variable, el contador R8 del trinquete bajó, y el apilamiento real no se movió ni un milímetro. Para aislar de verdad, la declaración va en el **ancestro común** del racimo que compite, no en cada competidor.
>
> **La señal que estaba a la vista y no se leyó:** durante la implementación, aplanar los valores a números locales arbitrarios (25 → 1) invirtió el orden de pintado entre paneles del visor 3D. Se "arregló" restaurando los valores originales. Pero *que los valores originales siguieran importando* era exactamente la prueba de que no se estaba aislando nada. El arreglo tapó el síntoma y enterró la causa.
>
> **§ 2.4 es peor que inerte: es una regresión activa.** `.canvas-area` es uno de los pocos sitios donde el aislamiento SÍ funciona — y funciona en la dirección equivocada. `CalibrationModal` (`--z-modal`, 1100), los dos menús contextuales (1000) y `NotchPrecisionModal` se renderizan DENTRO de `.canvas-area`; aislarla los encierra en una caja con `z-index: auto`, y la barra de IA (`--z-bar`, 100, hermana posterior) les pinta encima. La nota de este mismo § 2.3 sobre `LayerPanel` explica **correctamente** esa mecánica —«la especificación de CSS trata `position: fixed` como contenido por el ancestro más cercano que establece contexto de apilamiento»— y la presenta como una ventaja, sin notar que dos secciones más abajo es el defecto.
>
> **Qué sigue vigente:** el § 2.3 **Grupo 1** (13 sitios globales → escala con nombre) es correcto y se mergea. Los §§ 2.1 y 2.2 (canaletas y `usePanelHost`) no dependen de esto.
>
> **Qué falta decidir antes de reintentar el Grupo 2:** aislar siempre tiene un costo — lo de adentro deja de poder escapar. Hay que decidir **racimo por racimo** quién se aísla y qué tiene permitido salir a la escala global (los menús contextuales, sin duda; los modales, sin duda). Eso es diseño, y no se hizo. Sin esa decisión, el Grupo 2 no vuelve.

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

### 2.1 Layout real (canaletas) — solo los paneles de contenido

**Corrección tras una vuelta más con Samuel, después de la primera aprobación de esta sección.** Él quiere que dos cosas se queden **flotando tal como están hoy, a propósito**: la barra de IA, y los docks de herramientas (`LeftDock`, `RightDock` — son puros botones de acción, "seleccionar", "pluma", "coser", "colocar", "simular"; no son paneles de contenido). Solo los **7 paneles de contenido** (Avatar, BOM, Grading, Inspector, Nesting, Layers, Properties) pasan a empujar el lienzo. Esto hace la Ola 2 más chica y de menos riesgo que el primer borrador — el ejemplo concreto: `canvas-area` ya es `display:flex` hoy (`layout.css:31`), así que **no hace falta tocar nada dentro de** `canvas-area__2d`/`__3d` — los docks siguen flotando encima del SVG/visor exactamente como ahora.

`canvas-area` pasa a ser una fila con hasta cinco hijos, en este orden:

```
canvas-area
├─ panel izquierdo?  (300px, si hay uno abierto — Properties/Grading)
├─ canvas-area__2d   (SIN cambios internos — LeftDock sigue flotando encima del SVG)
├─ divisor?          (solo en modo Split)
├─ canvas-area__3d   (SIN cambios internos — RightDock sigue flotando encima del visor)
└─ panel derecho?    (300px, si hay uno abierto — Avatar/BOM/Inspector/Nesting/Layers)
```

`ContextPanel` deja de ser `position: absolute` con offset (`top/right: var(--sp-3)`) y pasa a ser un hijo flex real de `canvas-area`, con ancho fijo (300px, sin `flex-grow`/`flex-shrink`). Conserva su material `overlay` (fondo, blur, borde, sombra, radio) — cambia el *mecanismo* de posición, no el aspecto.

**Trampa técnica real, verificada leyendo el código, no supuesta:** `canvas-area__2d`/`__3d` hoy reciben su ancho como **porcentaje calculado contra el 100% del contenedor** (`get2dWidth()`/`get3dWidth()` en `AppShell.tsx:203-212`, p. ej. `${splitRatio * 100}%`). Si a esos mismos hermanos se les agregan `panel izquierdo`/`panel derecho` de 300px cada uno sin tocar esa cuenta, el total se desborda 300-600px cada vez que un panel está abierto — los porcentajes no saben que ahora hay menos espacio disponible. El arreglo correcto no es matemática nueva a mano: es dejar que el propio flexbox reparta lo que sobra. Los paneles se fijan con `flex: 0 0 300px` (no crecen, no encogen) y `canvas-area__2d`/`__3d` pasan de `width: N%` a `flex-grow` (`splitRatio` y `1 - splitRatio`, `flex-basis: 0`) — con eso, CSS reparte automáticamente el 100% de lo que **queda** después de los paneles, sin que nadie tenga que calcular cuánto es "lo que queda". Bonus: `get2dWidth()`/`get3dWidth()` se simplifican a pasar el valor de `flexGrow` directo, ya no hace falta la función.

Lo que **sigue flotando, a propósito, sin cambiar su mecanismo de posición en esta fase:**
- La barra de IA (`UnifiedBar`) — sigue `position: fixed`, sigue arrastrable por el usuario (`barPosition.ts`, con su propio sistema de límites que ya evita la barra superior). El hallazgo de la auditoría ("cruza el divisor 2D/3D") viene de que su posición **por defecto** se calcula contra el ancho de toda la ventana (`barPosition.ts:52`, `(window.innerWidth - BAR_WIDTH) / 2`) sin saber nada del divisor — en la configuración más común (split 50/50 recién abierto) el centro por defecto de la barra y el divisor casi coinciden. Es un detalle estético de la posición inicial, no una función rota, y como Samuel quiere la barra flotando tal cual está, **no se toca `barPosition.ts` en esta fase** — inventarle una lógica nueva de centrado sería resolver algo que él no pidió con esa precisión.
- Los docks de herramientas (`DockShell.tsx`, usado por `Dock.tsx` del 2D y `RightDock.tsx` del 3D) — siguen `position: absolute`, mismo material `chrome`, sin cambios.
- Lo que ya estaba fuera de alcance por el contrato — menús transitorios, tooltips, submenús, `ConfirmDialog`, `ToastContainer`, `Ctrl+K`, el aviso de soltar-DXF.

**Consecuencia honesta de dejar los docks flotando:** el "ajustar a la vista" se arregla solo **para los paneles** (el SVG mide su rectángulo real, ya angostado). Para los docks, no — como siguen sin reservar espacio real, `computeFitView` (`editorSlice.ts:320`) sigue sin saber que hay ~54-68px de dock tapando el borde. Es un solape chico (medido en vivo: 4px de una pieza, en un caso concreto) y arreglarlo es barato porque el ancho del dock es una constante fija, no dinámica: se resta un margen conocido antes de calcular el encuadre. Se incluye en esta fase por ser de bajo costo y cerrar un hallazgo real de la auditoría, no por ser parte del pedido de Samuel — si al verlo en el navegador no vale la pena, se puede dejar fuera sin rehacer nada más.

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

**Grupo 2 — local (26 sitios):** ⚠️ **RETIRADO — ver la enmienda del 2026-08-15 al principio de este documento.** Lo que sigue quedó escrito sobre una premisa falsa y se conserva como registro, no como instrucción. Se le agrega `isolation: isolate` a su contenedor. Los archivos: `FitMapToggle`, `PanCrosshair`, `SelectionOverlay`, `SimulationStatusOverlay`, `Viewport3D` (en sus dos overlays propios), `FloatingActionBar`, `BOMTab`, `GradingTab`, `LayerPanel`, `EmptyState2D`, `AvatarPanel`, `CollisionBodyPanel`, `RenderSettingsPanel`, `SnapshotBar`, `SurfaceModePill`, y dos que no había nombrado en la primera pasada de este documento: `RightDock` (el control `.floating-3d`, un botón que flota sobre el visor 3D con el mismo rol que `SurfaceModePill`) y `UnifiedBar` (un segundo aviso de soltar-DXF, local a la barra e independiente del que ya tiene `AppShell.tsx`).

Sus valores pequeños (1–90) se extraen a variables CSS **locales al propio archivo** (p. ej. `.fit-map-toggle { --capa-barra: 1; --capa-escala: 2; }`), no a la escala global — la regla del contrato se cumple (ningún literal suelto) sin inflar la escala compartida con roles que nadie más usa.

`CalibrationModal` también gana `isolation: isolate`, aunque no tenga un segundo z-index local hoy: es la superficie más "modal" del grupo (tiene velo, bloquea), y aislar su propio subárbol evita que cualquier control que se le agregue después necesite pedir permiso a la escala global.

Nota sobre `LayerPanel`: su menú contextual (`.layer-context-menu`) es `position: fixed`, no `absolute` — pero un `isolation: isolate` en el contenedor del panel sí lo contiene para efectos de apilamiento (la especificación de CSS trata `position: fixed` como contenido por el ancestro más cercano que establece contexto de apilamiento, aunque su posición visual siga calculándose contra el viewport). No necesita escapar a la escala global.

### 2.4 `.canvas-area` como límite de aislamiento

⚠️ **RETIRADO — regresión activa, ver la enmienda del 2026-08-15 al principio.** Aislar `.canvas-area` encierra los modales y los menús contextuales que se renderizan dentro de ella, y la barra de IA les pinta encima. Se conserva como registro, no como instrucción.

`.canvas-area` gana su propio `isolation: isolate`. Con eso, `.canvas-area__divider` (hoy z:5) deja de necesitar un rol global — es orden local dentro de ese límite, igual que el Grupo 2.

## 3. Archivos que toca

**Nuevo:**
- `src/hooks/usePanelHost.ts` + `src/hooks/__tests__/usePanelHost.test.ts`

**Modificado — layout (Ola 2, solo paneles de contenido):**
- `src/components/shell/AppShell.tsx` — reemplaza `contextPanel`/`setContextPanel` por `usePanelHost()`; agrega los dos hijos `panel izquierdo?`/`panel derecho?` a `canvas-area` (docks y barra de IA **sin tocar**); los cinco sitios de apertura usan `openPanel`/`togglePanel` según 2.2; `get2dWidth()`/`get3dWidth()` se simplifican a valores de `flexGrow` (ya no calculan porcentaje); el aviso de soltar-DXF usa `var(--z-hint)`.
- `src/components/shell/ContextPanel.tsx` + `.css` — de tarjeta flotante con offset a hijo flex real (`flex: 0 0 300px`); usa `closePanel`.
- `src/styles/layout.css` — `.canvas-area` gana `isolation:isolate`; `.canvas-area__2d`/`__3d` cambian de `width: N%` a `flex-grow`/`flex-basis: 0` (la trampa de desbordamiento explicada arriba); `.top-bar` migra su z-index (mecánico, Ola 1).
- `src/components/PatternEditor/PatternEditor.tsx` — la llamada a `computeFitView(pieces, rect.width, rect.height)` (línea 672) resta el ancho fijo del dock antes de pasar `rect.width`, para que el encuadre no quede corrido por el dock que sigue flotando. Cambio de una línea; opcional según lo que se vea en el navegador (ver 2.1).

**Modificado — z-index, Ola 1, mecánico, sin relación con el layout (Grupo 1, tabla de 2.3):** `src/components/shell/Dock.css` (envoltorio de `DockShell.tsx`, usado por `Dock.tsx` y `RightDock.tsx` — solo el z-index, no su posición), `src/styles/unified-bar.css` (solo el z-index, no su posición ni su arrastre), `src/components/shared/SubMenu.css`, `src/copilot/connections/ConnectionModal.tsx`, `src/components/PatternEditor/CalibrationModal.css`, `src/components/PatternEditor/NotchPrecisionModal.css`, `src/components/Debug/SolverMetrics.css`, `src/components/shell/ToolTooltip.css`, `src/styles/floating.css` (menú del logo, su submenú, el menú contextual).

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
- En modo Split, con un panel abierto de un lado, las dos mitades 2D/3D siguen sumando el 100% del espacio que queda — sin desborde ni hueco (la trampa de la sección 2.1).
- "Ajustar a la vista" encuadra sin que el panel tape nada, con un panel abierto.
- Los docks de herramientas y la barra de IA se ven y se comportan exactamente igual que hoy — sin cambios, es la prueba de que no se tocaron por accidente.
- El toast sigue viéndose por encima de un modal abierto (no debe regresar el bug que se arregló en la Fase 1).

## 5. Orden de implementación

Un solo diseño, dos olas — no porque sean proyectos distintos, sino porque tienen perfiles de riesgo muy distintos y una depende poco de la otra:

1. **Ola 1 — z-index (2.3 y 2.4).** Mecánico, ~40 archivos, cada cambio es una línea. Sin riesgo visual: los valores migran uno a uno y `ui-contract-lint.mjs` certifica que ninguno queda suelto. Sale primero, en su propio PR, y deja el terreno limpio para la Ola 2.
2. **Ola 2 — canaletas y modelo de paneles (2.1 y 2.2).** Con el recorte de alcance (solo los 7 paneles de contenido, docks y barra de IA intactos) es más chica de lo que se diseñó al principio: básicamente `AppShell.tsx`, `ContextPanel`, `usePanelHost` y el cambio de `width:%` a `flex-grow` en `layout.css`. Aun así es la parte con riesgo visual real sobre el 2D de María — sale después de la Ola 1, verificada en el navegador contra su DXF real antes de mergear.

## 6. Fuera de alcance, a propósito

- Paneles múltiples del mismo lado (Avatar + BOM). Necesitaría pestañas o apilado — pieza de interfaz nueva, no solo re-plomería de layout. Se revisita si se pide.
- Breakpoints/diseño responsive de los paneles (300px fijo se mantiene). La auditoría lo señaló como hueco aparte; no es este alcance.
- Tocar el visor 3D — ya reacciona solo a los cambios de su contenedor.
- Que los docks de herramientas y la barra de IA dejen de flotar. Samuel los quiere así, a propósito — son botones de acción, no paneles de contenido.
- La posición **por defecto** de la barra de IA respecto al divisor 2D/3D (el hallazgo original de la auditoría). Se acepta el solape estético inicial; la barra sigue flotando y arrastrable exactamente como hoy, y su lógica de posición (`barPosition.ts`) no se toca en esta fase.
- "Interfaz inteligente" que solo despliegue lo que hace falta en cada momento (idea de Samuel, del 2026-08-14). Es un proyecto propio, más grande que esta fase — se brainstormea aparte, cuando se pida.
