# Barra de opciones de herramienta — diseño

**Fecha:** 2026-08-16
**Issue:** #1049
**Ley que cierra:** ley de puertas (§5.6 del contrato de interfaz) — *una función que se despacha tiene una puerta visible en el shell*.
**Contrato:** `.claude/skills/contrato-de-interfaz/SKILL.md` · auditoría `docs/reports/2026-08-14-auditoria-ui-deriva-de-diseno.md`

---

## 0. La historia, porque cambia lo que hay que hacer

Esto no es construir algo nuevo. **La barra existió, se montó, y se borró.**

| Commit | Fecha | Qué pasó |
|---|---|---|
| `0c4c0c9a` | 2026-03-14 | Crea `ToolOptionsBar2D` (#263), 124 líneas |
| `e416586a` | 2026-03-14 | La monta en `Workspace.tsx` |
| `67349b32` | 2026-02-23 | Desmonta `ToolOptions/`, la barra anterior |
| `3fbcce8d` | 2026-05-22 | Borra `Workspace.tsx` — la barra 3D muere por arrastre |
| `f4c5e92c` | 2026-06-03 | Borra la isla `Toolbar2D` entera: *"zero live imports"* |
| `ad208464` | 2026-06-04 | Barre los dos renderers huérfanos, 481 líneas |

El último dejó el hueco **escrito a propósito**:

> *"Documented capability gap: tool options are READ by ~10 live tools (pin strength, walkSeam tolerance, trimPlace, polyPen, ...) but the only live setter is the slashAndSpread keyboard toggle — users sit on defaults. A future options surface is a product decision, tracked in memory."*

Junio sabía y difirió. **Este documento es esa decisión de producto**, tomada porque agosto la cobró: la entrega `para maria/12-herramienta-de-puntos/NOTA-herramienta-de-puntos.txt` le dice textualmente *"la herramienta tiene tres modos, en el panel de opciones de arriba"* y le pide probar los tres. Ese panel no existe. Las capturas 5 y 6 de esa entrega se hicieron despachando al store desde Playwright — una puerta que ella no tiene.

Ya pagamos el rodeo dos veces más:

- `docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md:415`, en "The Cut": *"Una barra de opciones de herramienta — no existe en la app (#1049). El split crear/editar son dos entradas de dock precisamente para no depender de ella."*
- `docs/superpowers/plans/2026-08-13-tanda-2b-familia-distancia.md:51`: *"No añade una barra de opciones de herramienta. No existe en la app (#1049)."*
- `docs/superpowers/specs/2026-03-29-trim-placement-tool-design.md:61` la da por existente: *"Tool options bar renders the standard `ToolOptionsBar2D` controls."*

**Consecuencia de diseño:** se **repone** el componente de `f4c5e92c^`, no se escribe de cero. Lo que cambia es el emplazamiento, el idioma, y lo que se le quita por no tener puerta.

---

## 1. Qué cambia para María

Hoy, con cualquier herramienta 2D activa, no hay forma humana de cambiar cómo se comporta. Los modos existen, están implementados y testeados; el único que puede tocarlos es el copiloto (`src/tools/copilotSchemas.ts:121`).

Después:

- **Los tres modos de Punto se alcanzan.** Punto, Curva por puntos, Curva bezier — lo que la NOTA le prometió.
- **Cada herramienta declara lo suyo y se ve.** Piquete enseña forma, profundidad y cantidad. Tijeras enseña si cose el corte y con qué costura. Coser enseña el tipo de costura.
- **La barra dice qué herramienta está activa y con qué tecla se llama**, incluso cuando esa herramienta no tiene opciones. El dock ya enseña el atajo en su tooltip, pero solo al pasar el mouse por encima y solo de las 14 que están en él; la barra lo dice sin gesto, y de las 31 alcanzables. Y lo dice del **atajo efectivo**: el dock escribe el suyo a mano y miente si la usuaria remapeó.

  > La primera versión de este renglón decía que Piquete tenía `⇧N` registrado "y ningún sitio lo mostraba", citando la auditoría §5.5. Es falso hoy: `Dock.tsx:43-48` lo pinta en el tooltip y en el `aria-label`. Corregido tras la revisión de la rama — la afirmación estaba escrita más fuerte de lo que es.
- **Todo en español.** De las 91 opciones declaradas en el repo, hoy exactamente **una** tiene la etiqueta en español.

---

## 2. Emplazamiento

`.canvas-area__2d` (`src/styles/layout.css:36`) pasa a `display: flex; flex-direction: column`, con dos hijos en flujo:

| Hijo | Regla |
|---|---|
| `<ToolOptionsBar2D />` | `flex: 0 0 auto` — reserva su alto |
| `<PatternEditor />` | `flex: 1 1 0; min-height: 0` |

**Es cromo acoplado a una canaleta, no algo que flota.** Eso es la ley de emplazamiento (§5.2), y trae tres consecuencias mecánicas:

1. **Material `chrome`, opaco.** La ley de materiales define `chrome` como *"acoplado a una canaleta; opaco"* — es literalmente esto. No `overlay`: su `backdrop-filter` convierte al elemento en bloque contenedor de sus descendientes `position: fixed`, y ese mecanismo ya costó tres bugs (`ConnectionModal`, `ToolTooltip`, el menú contextual de Capas).
2. **Sin `z-index`.** Es un hijo en flujo, como los paneles de la Ola 2. Si necesitara una capa, sería que el emplazamiento está mal.
3. **El encuadre no cambia.** `handleZoomToFit` (`src/components/PatternEditor/PatternEditor.tsx`) mide `svgRef.current.getBoundingClientRect()`, y ese rect ya excluye la barra por sí solo. `DOCK_WIDTH_PX = 68` se queda tal cual: el dock **sigue flotando**, y esa compensación a mano sigue haciendo falta para él.

**`LeftDock` no se toca.** `.dock` es `position: absolute; top: 50%; transform: translateY(-50%)` (`src/components/shell/Dock.css:3-19`) — centrado, no anclado arriba. Fuera de flujo, así que el flex de columna no lo mueve; queda centrado sobre la columna entera en vez de sobre el documento, o sea ~18px más abajo de lo que estaba. No se corrige: el costo de un `<div>` envoltorio extra es mayor que 18px que nadie mide.

**Desbordamiento horizontal dentro de la barra** (`overflow-x: auto`). Tijeras declara 4 opciones; en ventana angosta con dos paneles abiertos no caben. La barra hace scroll dentro de sí misma y **nunca empuja el layout**.

### El riesgo real de este cambio

`.pattern-editor` es `width: 100%; height: 100%` (`src/components/PatternEditor/PatternEditor.css:1-7`). Un porcentaje de alto en un hijo flex se resuelve contra el alto del contenedor **ignorando** que un hermano ya se llevó espacio, así que mal puesto desborda por debajo de la barra. `flex-basis: 0` gana sobre `height` para el tamaño base, pero eso hay que **medirlo, no razonarlo**: lo fija el e2e de §8, no la revisión a ojo.

---

## 3. Contenido

```
[ Nombre de la herramienta ]  [ atajo ]  │  [ control ]  [ control ]  …
```

**El nombre sale de `ToolDefinition.name`** (`src/tools/types.ts:28`). Es el mismo objeto que declara `options`, así que la barra lee una sola cosa. Hoy ese campo está en inglés para casi todas (`'Circle/Curve Tool'`, `'Dart'`, `'Add Piece'`); se traduce ahí — ver §5.

**El atajo sale del atajo efectivo, no del predeterminado.** `useShortcutRegistry().getBinding('tool.<id>')` (`src/shortcuts/ShortcutRegistry.ts:53`) devuelve el `KeyCombo` real — el que la usuaria remapeó si lo remapeó, porque `ShortcutRegistry` persiste sobrescrituras en `vina-shortcut-overrides`. Se formatea con `displayShortcutBinding()` (`src/components/shell/shortcutDisplay.ts:33`), la notación única que manda la ley de atajos (§5.5). Las herramientas sin atajo no lo muestran.

> El dock **no** hace esto: `DOCK_2D_CATALOG` escribe `shortcut: 'Z'` a mano, así que enseña el predeterminado aunque esté remapeado. Es la misma deuda de las dos notaciones (§10), y la barra no la hereda.

**Cuando la herramienta activa no tiene opciones, el canal sigue ahí** con el nombre y el atajo. No se colapsa. Razón medida: 7 de las 14 herramientas del dock no tienen opciones, así que un canal que aparece y desaparece haría saltar el patrón ~36px en cada cambio de herramienta. El componente borrado hacía `return null`, pero él **flotaba**: no saltaba nada. Acoplado, esa misma línea es un defecto.

---

## 4. Los cuatro controles

`ToolOption.type` (`src/tools/types.ts:45-56`) admite exactamente cuatro, y no hay visibilidad condicional en el tipo:

| Tipo | Control |
|---|---|
| `number` | deslizador + valor numérico visible |
| `select` | desplegable |
| `toggle` | interruptor |
| `color` | selector de color |

**El `toggle` cambia respecto al borrado.** Pintaba `ON` / `OFF` literales: se van, por ley de idioma. Queda estado visual + `aria-pressed`, y por ley de estado (§5.3) **no puede depender solo del tono** — cambia también el relleno, porque un control de 16px que solo cambia de color no comunica nada y falla para quien no distingue colores.

**Todo lo que tenga `:hover` tiene `:focus-visible`.** Esto no es disciplina: el trinquete R5 cuenta 65 selectores con `:hover` sin `:focus-visible` y **falla si el contador sube**. CSS nueva sin foco visible rompe el gate sola.

Ningún color literal: todo sale de `src/styles/tokens.css` (R3 está en 966 y tampoco puede subir).

---

## 5. Idioma

Desglosado exacto:

| Qué | Cuántas | Estado hoy |
|---|---|---|
| Nombres de herramienta (`ToolDefinition.name`) | 21 | 20 en inglés, 1 en español (`point`) |
| Etiquetas de opción (`ToolOption.label`) | 52 | 51 en inglés, 1 en español (`point.mode`) |
| Etiquetas de desplegable (`choices[].label`) | 72 | 69 en inglés, 3 en español (las de `point.mode`) |
| **Total** | **145** | **140 en inglés** |

Todas a español, **en la definición** (`src/tools/definitions/*.tsx`), no en la barra: un solo sitio, el mismo donde ya vive `name`.

Los `value` de los `choices` **no se tocan**: siguen siendo `'curvePoints'`, `'flat-felled'`, `'outward'`. Son identificadores, no texto.

El término lo manda el glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md` — pieza, costura, margen, piquete, pinza, tramo. Un término por concepto.

Dos cosas que esto destapa, y cómo se resuelven:

### 5.1 El copiloto usa la etiqueta como descripción del parámetro

`src/tools/copilotSchemas.ts:95` hace `description: hint || option.label`. Traducir cambia lo que ve el LLM cuando la opción no tiene `parameterHints`.

**No cambia el comportamiento:** el `enum` del schema sale de `choices.map(c => c.value)` (`:106`), y los `value` son identificadores en inglés que **no se traducen** (`'curvePoints'`, `'flat-felled'`, `'outward'`). Donde una descripción en español le quite precisión al modelo, se añade la entrada en `copilot.parameterHints` en inglés — el escape que el tipo ya tiene y que `point.tsx:69-71` ya usa.

### 5.2 Hay dos nombres en español para la misma herramienta

`DOCK_2D_CATALOG` dice `'Pluma'` (`src/components/shell/dock2dTools.ts:29`). `src/shortcuts/defaults.ts:41` dice `'Polígono (pluma)'`. Misma herramienta, `pen`.

Nadie lo notaba porque nunca aparecían juntos en pantalla. La barra los pone al lado del dock, así que la deriva se vuelve visible.

**Se resuelve con un test-guardia**, no con una elección silenciosa: una prueba ata `DOCK_2D_CATALOG[i].label` a `ToolDefinition.name` del mismo id. Convierte una deriva invisible en un fallo de test que hay que resolver una vez, aquí. `seamEdit` se exceptúa explícitamente: está en el catálogo del dock y **no tiene definición** en `src/tools/definitions/` (su handler vive en `useSeamEditTool`).

### 5.3 Dos términos que el glosario no resolvía

**`hilo` estaba pedido dos veces.** El glosario le asigna `hilo` a *grainline*, y *thread* también es hilo. Se queda **"Color del hilo"** en las tres herramientas de pespunte: en una barra que ya dice "Tipo de puntada" y "Largo de puntada", nadie lo lee como la dirección del tejido, y el glosario ya deja abierta la forma larga de grainline ("dirección de hilo si hay espacio") que desambigua por el otro lado. **Va como enmienda al glosario**, no como excepción tácita.

**`flat-felled` queda por confirmar.** Es el único término del lote donde equivocarse le cuesta a María, y las tres candidatas se pisan con otra cosa: *ribeteada* en taller suele significar overlock, *rebatida* es la operación de industria en Venezuela y Colombia pero no todo el mundo la nombra así, y *tipo jean* es exacto y coloquial. El plan escribe **"Rebatida"** como supuesto declarado. **Antes de que salga una entrega a María hay que confirmarlo con ella o con Samuel**; las otras tres del mismo desplegable (Normal, Francesa, Overlock) no tienen duda.

### 5.4 Tres cambios que no son traducción

Salieron al traducir y son correcciones de oficio, no de idioma:

- **`dart.dartDepth`** está etiquetada `Depth (mm)`. En una pinza eso es el **largo** —de la boca al vértice—, no la profundidad. Se traduce como "Largo (mm)". El piquete sí lleva profundidad y ahí se queda.
- **`walkSeam.ghostOpacity`** → "Opacidad del calco". El *ghost* es la copia translúcida de la pieza que se recorre; en el oficio eso es un calco.
- **`scissors.autoSew`** → "Coser el corte automáticamente", que usa el verbo del glosario ("coser automáticamente") en vez de inventar uno.

---

## 6. Alcance: las tres categorías

Las 91 opciones del repo se reparten en tres grupos, y solo el primero entra:

### A — Alcanzables en 2D: **20 herramientas, 52 opciones. ENTRAN.**

Todo lo que María puede activar hoy, sea por el dock o por atajo. Las activaciones pasan todas por un único escritor, `activate2DTool` (`src/store/toolActivation.ts:20`), llamado desde `LeftDock`, `useKeyboardShortcuts`, `PatternEditor`, `EmptyState2D` y el copiloto.

| Puerta | Herramientas con opciones |
|---|---|
| Dock (7) | `point` 1 · `pen` 3 · `rectangle` 3 · `scissors` 4 · `measure` 2 · `seam` 2 · `notch` 3 |
| Solo atajo (13) | `transform` 2 · `circle` 2 · `trace` 1 · `dart` 4 · `pin` 1 · `walkSeam` 2 · `polyPen` 3 · `pomMeasure` 2 · `offsetOutline` 4 · `extendTrim` 2 · `topstitchFree` 3 · `topstitchSeamline` 4 · `topstitchSegment` 4 |

`topstitchEdit` declara `options: []` y tiene atajo: entra en la lista de herramientas (muestra nombre + atajo), sin controles.

### B — Herramientas 2D vivas sin ninguna puerta: **6 herramientas, 14 opciones. NO ENTRAN.**

`autoTrace` 3 · `mirror` 2 · `slashAndSpread` 2 · `trimPlace` 5 · `measureCurve` 1 · `compareCurves` 1.

Sus hooks corren y leen `toolOptions`, pero no están en el dock ni tienen atajo. `measureCurve` y `compareCurves` iban a alcanzarse por un flyout de sub-herramientas que **no está implementado** — `ToolDefinition.subTools` existe en el tipo y ningún componente lo lee.

**Es la misma ley de puertas, un nivel más arriba: no les falta la barra, les falta la puerta.** Darles barra sin darles activación no arregla nada. Va aparte.

### C — 3D, ocultas y solo-copiloto: **25 opciones. NO ENTRAN.**

`pose` 2 (declarada pero **no registrada** — `src/tools/index.ts:41`, *"pose tool removed — pose controls are inside AvatarPanel"*) · `meshGrab` 2 · `meshSelectBox` 1 · `meshSelectLasso` 1 · `steamBrush` 2 · `simulate` 3 · `arrangement` 2 · `zoom` 1 — subtotal 14. Más los 6 de render (`setRenderResolution` 3 · `exportRender` 3 · `setRenderQuality` 2 · `setGarmentDisplayMode` 1 · `setAvatarRenderStyle` 1 · `applyLightingPreset` 1) — subtotal 11.

El gemelo 3D murió en el mismo commit y merece reponerse, pero su host es otro: `Viewport3D` corre con `hideChrome` y sus propios overlays. Riesgo distinto, tanda distinta.

> 52 + 14 + 25 = 91. La suma cierra: no hay opciones sin clasificar.

---

## 7. Lo que no entra, y por qué

| Fuera | Razón |
|---|---|
| El gemelo 3D | Otro host, otro riesgo de emplazamiento (§6.C) |
| El modo experto | `workflow.expertMode` **no se despacha desde ningún componente**: es siempre `false`. La rama de ocultar-en-modo-experto que traía el componente borrado sería código muerto no verificable |
| El colapso por re-clic | Con el canal siempre presente no compra nada, y un panel colapsado sin manija de vuelta viola la ley de puertas — el componente viejo hacía `return null`, sin ninguna señal de cómo volver |
| Quitar el piquete duplicado de `PieceProperties` | `PieceProperties.tsx:26-34` escribe el mismo `toolOptions.notch`, así que no se desincronizan. Quitarle una sección que quizá ya usa es un cambio visible que va aparte |

### Limpieza que sí entra

**Borrar `optionsPanelCollapsed` y `expertShowOverride` de `toolSlice`** (`src/store/toolSlice.ts:10-11`). Los dos se escriben (`:32`, `:35`, `:46`, `:49`) y **ningún componente los lee en todo `src/`**. Con el canal permanente, el primero deja de tener sentido; el segundo solo lo tendría si el modo experto tuviera puerta.

Es exactamente el estado fantasma que hace perder una tarde: alguien lee `optionsPanelCollapsed` en el slice, deduce que existe un panel plegable, y busca un componente que llevaba dos meses borrado.

---

## 8. La red

TDD estricto: test primero, verlo fallar por la razón correcta, implementación mínima, verlo pasar.

### 8.1 Unitario — la barra

- Con una herramienta que declara N opciones, pinta N controles del tipo declarado.
- Cambiar un control despacha `setToolOption({ toolId, optionId, value })`.
- Con una herramienta sin opciones, pinta el nombre y el atajo, y **no** desaparece.
- Cada control tiene nombre accesible en español.

### 8.2 Guardia de idioma

Instantánea congelada de las 145 cadenas del grupo A — 21 nombres, 52 etiquetas de opción, 72 de desplegable. Una etiqueta nueva en inglés rompe el test. Es lo único que impide que la próxima herramienta reintroduzca la deriva que este documento arregla.

### 8.3 Guardia de nombre

`DOCK_2D_CATALOG[i].label === toolRegistry.getTool(id)?.name` para los 14 del dock, exceptuando `seamEdit` (sin definición). Ata las dos fuentes de nombre.

### 8.4 E2E — **obligatorio, no opcional**

La restricción global enmendada el 2026-08-15 exige que cualquier cambio de `z-index`, `isolation`, `position`, `overflow` o `backdrop-filter` se fije con un Playwright que **mida el resultado, no el valor declarado**. Esto cambia el modelo de caja de `.canvas-area__2d`. jsdom es ciego a esto: `getBoundingClientRect()` devuelve 0.

Casos:

1. Activar Punto: el desplegable existe, trae los tres modos, y elegir "Curva por puntos" cambia el store.
2. **El alto del SVG del patrón no cambia** al alternar Punto (con opciones) ↔ Seleccionar (sin opciones). Es el caso que justifica haber elegido canal permanente.
3. El SVG **no desborda** por debajo de la barra: su borde inferior queda dentro de `.canvas-area__2d`. Es la red del riesgo de §2.
4. Con un panel de contexto abierto, la barra hace scroll horizontal dentro de sí misma y **el ancho del documento no cambia**.
5. La barra es `position: static` y `z-index: auto` — cromo en flujo, no una capa más.

### 8.5 Gates

`npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. El trinquete no puede subir ningún contador; R5 (`:hover` sin `:focus-visible`) y R3 (color literal) son los que este cambio puede empujar.

---

## 9. Riesgos nombrados

| Riesgo | Cómo se cubre |
|---|---|
| `.pattern-editor` con `height: 100%` desborda sobre la barra | Caso 3 del e2e |
| El patrón salta al cambiar de herramienta | Caso 2 del e2e; es la razón de que el canal sea permanente |
| Traducir cambia el schema del copiloto | Los `value` del `enum` siguen en inglés; `parameterHints` en inglés donde la precisión importe (§5.1) |
| Encender 20 herramientas expone opciones de herramientas a medio terminar | Las 20 ya son alcanzables y ya leen sus opciones; la barra no las activa, solo enseña lo que ya corre con el valor por defecto |
| `'Pluma'` vs `'Polígono (pluma)'` | El guardia de §8.3 lo hace explotar; se elige uno aquí |

---

## 10. Cabos que quedan escritos

- **`point.tsx:29-30` miente.** Dice que el sub-modo *"persiste entre activaciones vía toolMemory"*. No persiste: `confirmationMiddleware.ts:129` solo restaura `toolMemory` si `expertMode`, que es siempre falso. La sub-cascada b (`:200`) **sí** espeja cada `setToolOption` en `workflow.toolMemory`, así que sus elecciones se guardan y nunca se le devuelven. Hermano de esto, arreglo aparte.
- **El modo experto no tiene puerta.** `expertMode` está persistido con esquema zod, lo lee `useGuardedAction` para decidir si una acción destructiva pregunta, y lo lee `confirmationMiddleware`. Nadie lo puede encender. Misma ley, otro issue.
- **El dock escribe sus atajos a mano** (`shortcut: '⇧L'` en `dock2dTools.ts`) en vez de derivarlos de `shortcuts/defaults.ts` vía `shortcutDisplay.ts`. Dos notaciones para una ley que pide una. No se toca aquí.
- **Grupo B: seis herramientas 2D vivas sin puerta** (§6.B). Es el mismo hallazgo de #1049 un nivel más arriba.
- **El gemelo 3D** (§6.C) cierra entero el hueco que `ad208464` dejó escrito.
