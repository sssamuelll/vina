# La interfaz en papel — P2a (el marco del patrón: margen, barra superior, AUTO fuera) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el patrón se trabaje desde su marco y no desde lo que flota encima: las herramientas en un margen de papel pegado a la hoja, los seis interruptores de lo que se ve en la barra superior con el selector de vista quieto en el centro, y sin la zona AUTO, cuyas sugerencias conservan puerta.

**Architecture:** El dock izquierdo deja de flotar: `Dock.tsx` pasa a pintar una columna `nav.margen` de 44 px, en el flujo de `.canvas-area__2d` (que se vuelve flex) y con `data-material="papel"`, así que la hoja empieza donde el margen termina y el encuadre ya no descuenta ninguna faja. La barra superior pasa de dos espaciadores a una rejilla de tres columnas (`minmax(0, 1fr) auto minmax(0, 1fr)`) y aloja `FilaDeCapas`, que mide su hueco con un `ResizeObserver` y se pliega en «Mostrar» cuando no cabe. La zona AUTO se borra entera; el sobre `vina-docks` pasa a v2 y sigue leyendo el v1.

**Tech Stack:** React 18 + TypeScript, Redux Toolkit, zod, CSS con custom properties, Vitest (jsdom + lectura de fuentes), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` — § 4.2 (barra superior), § 4.3 (márgenes de herramientas), § 7.2 (el ámbito de papel, nota «cuándo lo lleva cada cosa»), § 8 (lo que se borra: la zona AUTO, la fila como tarjeta, y el sobre del dock), § 9 (trinquetes y «el selector de vista no se mueve, desde P2»), § 10 (enmiendas del contrato § 2 y § 3), § 11 (fila P2) y § 12 (la pantalla de María).

**Rama:** `feat/interfaz-en-papel-p2a`, creada desde `feat/interfaz-en-papel-p1b` en `c2eb1a96`: la PR #1228 (P1b) sigue abierta, y P2a necesita su ámbito de papel. Este plan es su primer commit. Si #1228 se mergea antes de que P2a abra su PR, la PR de P2a va contra `main` igual: los commits de P1b ya estarán ahí.

**Ensayado.** El 2026-10-03 el plan se ejecutó entero sobre `c2eb1a96`, en una rama aparte (`ensayo/p2a`, local, sin subir), y sus bloques de código salen de esos commits: cada «reemplaza» es un hunk del ensayo con su contexto. Aplicado con un script sobre `c2eb1a96` en un worktree limpio, el plan reproduce byte a byte el árbol final del ensayo (122 instrucciones; solo difieren las cuatro líneas base, que se fijan con sus comandos), y el script exige que cada texto viejo aparezca una sola vez. Cada rojo y cada verde de las Tasks 1 a 4 se vio en ese worktree, tarea sobre tarea, y los e2e de cada tarea se corrieron sobre el estado de esa tarea, con su propio servidor: los conteos de los «Expected» son los medidos. Con todo aplicado: el typecheck limpio; la suite unitaria, 780 archivos y 9345 tests en verde (13 saltados); el lint y el contrato limpios (R3 535, R5 34, R8 23). Y `bash scripts/deploy-prod.sh --ensayo` entero en verde: los 211 casos de la lista e2e del gate (34 specs, 36,2 min) sin ningún flaky, los 18 de la home y el build.

Lo que el ensayo cazó, y el plan ya trae: Playwright esconde las barras de desplazamiento, y el e2e del recorte del margen pasaba sin medir nada (Global Constraints, Task 2). A 1366, con 2 px de relleno lateral, los seis interruptores no cabían por 5 px (Task 3). La primera corrida del gate dio 199 de 211, y los doce rojos eran de los tests, no del código. Ocho pulsaban «Largos» con el viewport de 1280 de estos e2e, donde el grupo se pliega (Task 3). Cuatro clics caían en la tarjeta o en la barra de IA porque la hoja empieza 44 px más a la derecha (Task 2). Además, sobre el estado de la Task 2, un clic caía en la fila, que todavía vive en el lienzo. Y el caso de «Construcción» de `trazos` pasaba solo por una carrera con la fuente: antes de que cargue Inter, los seis caben. Por último, dos mutaciones juntas se tapaban (Task 3, Step 5). Las capturas del ensayo, a 1366 × 643 y a 1280 × 720, están en `docs/reports/ui-audit-2026-10-02-hoy/p2a-en-la-app.html` (carpeta fuera de git).

## Cómo se parte P2

P2 es la fase más grande del programa (§ 11, tamaño L): toca el dock, la barra superior, la tarjeta de herramienta, la barra de IA, la pantalla vacía y Preferencias. Solo la primera parte, ensayada, cambia 51 archivos (+1097 −898). La spec dice «cada fase tiene su plan, su PR y su despliegue»; este plan propone partir P2 en tres PR, cada una publicable con todas sus puertas, como la spec ya hace con P6 («L, en 3-4 PR»):

| Parte | Qué entra | Cómo queda la app al publicarla |
|---|---|---|
| **P2a** (este plan) | El margen de herramientas del patrón, con su desborde. La barra superior: selector centrado y fijo, grupo del patrón (y su plegado). AUTO fuera, con sus puertas y la migración del sobre. | Las herramientas en el margen; los interruptores arriba; la tarjeta y la barra de IA, como hoy. |
| **P2b** | La línea al pie, con todas las opciones de todas las herramientas; la frase con `falta` y `desenlace`; la tarjeta se borra. La hoja gana el ámbito de papel. | Ninguna opción en una esquina: todas en la línea al pie. |
| **P2c** | La IA convocada (un modo, tres estados, conversación que sobrevive, `Ctrl+/`, Esc en la escalera). Preferencias como panel. Pantalla vacía de tres caminos. La marca de escala abajo. `--band-bar` fuera. | Nada flota en reposo (la fila P2 de § 11, entera). |

El orden es ese porque cada parte depende de la anterior: la marca de escala solo puede bajar cuando ni la fila ni la barra de IA viven en el borde de la hoja, y la hoja solo puede llevar el ámbito de papel cuando ya no tenga encima la tarjeta oscura. Si Samuel prefiere una sola PR para P2, P2b y P2c se escriben como tareas 5 en adelante de este mismo plan, sin tocar las cuatro de aquí.


## Global Constraints

- **El margen de herramientas** (§ 4.3): una franja de 44 px del color de la hoja (`--canvas-2d`), pegada al borde izquierdo del área 2D y separada de la hoja por una línea de pelo (`--hairline`). Reposo: icono en tinta, sin fondo. Activa: relleno `--accent` con el icono en `--on-accent`. Hover: `--bg-elevated`. Sin rótulo «2D». Las doce de fábrica, en tres grupos separados por aire: Seleccionar, Editar patrón, Punto · Pluma, Línea interna, Rectángulo, Tijeras, Medir · Coser, Editar costuras, Margen de costura, Piquete. Al final, «+», que agrega y quita sin activar. La activa siempre tiene marca: si no está en el margen, aparece al final mientras esté activa. Si no caben, el margen se desplaza con la barra a la vista y la activa se trae a la vista.
- **La barra superior** (§ 4.2): conserva su material (`--bg-deeper`). De izquierda a derecha: Vina, deshacer, rehacer, el grupo del patrón, el selector 2D / Split / 3D. El selector está en el centro de la ventana y no se mueve nunca. El grupo del patrón son los seis interruptores de hoy (Margen, Hilo, Piquetes, Costuras, Largos, Construcción), a 8 px de separación, y está cuando la vista es 2D o Split y hay piezas o trazos. El estado se lee en la marca (cuadro relleno o hueco) y en el tono del texto. Cuando no caben, se pliegan en un solo botón con los seis dentro; se decide midiendo, y en español a 1366 px no se pliega (lo fija un e2e). El grupo de la prenda (P5) y el botón «IA» (P2c) no entran aquí.
- **La zona AUTO se va entera** (§ 8): `DockAutoZone.tsx`, `dockSuggestions.ts`, `pinAuto`, `unpinAuto`, `toggleDockSignaling`, `pinnedExtra`, `signaling` y «Vista › Sugerencias del dock». Sus cuatro sugerencias conservan puerta: Escalado y Lista de materiales, en Vina › Patrón; Exportar DXF ya estaba en Vina › Archivo; Mapa de ajuste, en el visor 3D hasta P5.
- **El dock guardado no se pierde** (§ 8): `vina-docks` pasa a `{ version: 2, data: { tools2d } }`; `loadDocks` sigue leyendo el v1 con su esquema `.strict()` de siempre, descarta `pinnedExtra` y `signaling` y conserva `tools2d`. Lleva un test con un sobre v1 de verdad.
- **Textos nuevos** (decididos con la skill `solace-wren`): «Mostrar» (el botón del grupo plegado), «Qué se ve del patrón» (el nombre del grupo para el lector de pantalla, plegado o no), «Herramientas del patrón» (el nombre del margen), «Escalado...» y «Lista de materiales...» (Vina › Patrón). Español de Venezuela, sentence case, sin «¡» ni «por favor».
- Ningún color escrito a mano (R3 no sube), ningún `var(--x, respaldo)` (R1), ningún `z-index` literal (R8), todo `:hover` con su `:focus-visible` (R5). `scripts/ui-contract-baseline.json` solo con `node scripts/ui-contract-lint.mjs --update`, y se commitea en la tarea que bajó el contador.
- Typecheck: `npx tsc -b --noEmit` (nunca `tsc --noEmit` a secas). Gate completo: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Sin `--no-verify`. El hook de pre-commit corre el typecheck: vitest no lo corre, así que un test verde no prueba que el commit pase.
- `git add` con rutas explícitas; nunca `git add -A` ni `git add .`. Los borrados, con `git rm`. `.maria-avatar.mjs` no se commitea. Los mensajes de commit terminan con la línea de atribución que pida la sesión.
- E2E: el servidor de `http://localhost:5174` tiene que ser el de ESTE árbol de trabajo. Antes de la primera corrida: si algo escucha en 5174 y no es un `vite` lanzado desde este directorio, se para; se lanza `npx vite --port 5174 --strictPort` desde aquí y se espera a que `curl -s http://localhost:5174/app/ | grep -o "<title>[^<]*</title>"` devuelva `<title>Vina — Patronaje y simulación 3D</title>`. Siempre `--workers=2` o menos. Mientras corre un e2e no se edita ningún archivo que la app importe: Vite lo recarga en caliente en medio de la prueba.
- **Playwright lanza Chromium con `--hide-scrollbars`.** Todo e2e que mida algo que una barra de desplazamiento puede recortar la enciende con `ignoreDefaultArgs: ['--hide-scrollbars']`, conservando los `args` de WebGL del config. Sin eso, un botón que el Chrome de María recorta pasa entero en la prueba (medido: 33 px útiles con barras de verdad, 43 sin ellas).
- Línea base de un trinquete: solo con su variable `*_UPDATE=1` y `--retries=0 --workers=1`. Nunca a mano.
- Cada cosa que cambia lo que se ve se mira a 1366 × 643, que es el Chrome de María, y en Split (§ 12).
- No se hace push, ni PR, ni deploy sin que Samuel lo diga. El deploy es local: `bash scripts/deploy-prod.sh`; `--ensayo` corre todo menos el envío, y cualquier otro argumento se ignora y despliega.
- Si se ejecuta con subagentes: no commitean, no despliegan y no corren `scripts/deploy-prod.sh`; el controlador corre los gates y commitea.

## Review Focus

Lo que la spec da por hecho y ningún caso feliz prueba. Cada línea tiene su test en la tarea que se indica.

1. **El Chrome de María, con barras de desplazamiento clásicas.** Si las herramientas no caben, la barra se come el ancho de la columna: con 44 px fijos quedan 33 útiles para botones de 36. El margen tiene que crecer con su barra (44 → 47 px, y la hoja se corre esos 3 px solo mientras hay desplazamiento) en vez de recortar los botones. → Task 2 (e2e del catálogo entero, con barras de verdad; cae con `width: 44px`).
2. **Una herramienta activa que no está en el margen**, porque la activó un atajo (Transformar con A, Hilo con ⇧G), el menú o el copiloto: tiene que verse marcada al final, con su nombre en español, y desaparecer al soltarla. → Task 2 (unitarios de Hilo y Transformar; e2e de ⇧G con `elementFromPoint`).
3. **«Mostrar» abierto cuando la ventana vuelve a crecer** (o se cambia a 3D): el menú no puede quedarse colgando de `<body>` sin su botón, ni reabrirse solo cuando la ventana vuelva a encoger. → Task 3 (unitario que agranda y encoge el hueco con el menú abierto).
4. **Una ventana estrecha de verdad (1280 px, la laptop más común):** el grupo se pliega, y desde «Mostrar» los seis siguen a un clic, en un menú que no recorta la barra superior (que es contexto de apilamiento). → Task 3 (e2e a 1280, `elementFromPoint` sobre cada interruptor del menú) y Task 4 (estado de contraste a 1280).
5. **Una usuaria que vuelve con su sobre v1,** con sugerencias fijadas y `signaling: 'off'`: conserva su dock, y la siguiente escritura ya sale en v2. Un v1 corrupto sigue cayendo al dock de fábrica, como hoy. → Task 1 (unitario con la cadena del sobre v1) y el e2e `linea-interna-gramatica`, que siembra un v1 en el navegador.

## Decisiones de este plan

Lo que la spec no decide y este plan sí. Cada una con lo que cuesta si está mal.

1. **P2 se parte en tres PR** (sección de arriba). Si Samuel quiere una sola, P2b y P2c se escriben como tareas de este plan y no cambia nada de las cuatro de aquí.
2. **El margen crece con su barra.** Mide 44 px y, solo mientras se desplaza con barras clásicas, 47: su ancho sale del contenido (`width: auto; min-width: 44px`). Así la barra se suma en vez de recortar 3 px de cada botón. Lo que cuesta: la hoja se corre 3 px cuando el margen empieza a desplazarse (al encoger la ventana o al agregar herramientas), nunca por una acción. Si molesta, la otra salida es encoger los botones a 32 px mientras haya barra.
3. **Los grupos de las diez herramientas que la spec no nombra.** Editar: Mano y Abrir la pieza. Dibujar: Elipse, Triángulo, Hilo, Medir el borde y Comparar largos. Coser: Poner avío, Elástico y Pliegue. En un dock reordenado, el aire va entre cada dos herramientas seguidas de grupos distintos. Si alguno está mal, es una palabra en `dock2dTools.ts`.
4. **La activa que no es del catálogo** (Transformar, Contorno paralelo, Extender o recortar…) toma su nombre y su icono del registro de herramientas, sin atajo en el tooltip: la línea al pie de P2b dirá su tecla.
5. **Los textos:** «Mostrar», «Qué se ve del patrón», «Herramientas del patrón». «Capas visibles», el nombre que tenía la fila, chocaba con el panel Capas, que son las capas de piezas (forro, exterior, avíos). «Ver» se descartó por ser casi «Vista».
6. **«Escalado...» y «Lista de materiales...» nombran el panel y alternan,** como «Imágenes de referencia...» (el comentario de `LogoMenu.tsx` explica por qué). `MenuItem` gana el campo `panel`, y las dos puertas que ya abrían paneles comparando el rótulo («Avatar y medidas...», «Imágenes de referencia...») pasan a usarlo: son las mismas tres líneas de `handleItemClick`.
7. **`descriptionTone` del tooltip se borra** con la zona AUTO: era su único usuario.
8. **`FilaDeCapas` conserva su nombre y su archivo** (§ 8: «el componente se queda y cambia de sitio»). Se borra `FilaDeCapas.css` (la tarjeta) y sus estilos van a `layout.css`, junto a `.top-bar`, con clases nuevas (`.grupo-del-patron*`).
9. **La marca de escala se queda arriba** en P2a, con `izquierda={12}` en vez de `DOCK_WIDTH_PX + 12`: el margen ya no está encima de la hoja. Baja a su sitio (§ 4.4) en P2c.
10. **El rótulo «2D» se va** (§ 4.3), y con él el e2e de tanda 4 que pedía que no se fuera con el scroll. Lo reemplaza uno que pide lo que María vio de verdad, que la columna no se mueva al desplazarse.

**Lo que el ensayo vio y este plan no arregla.** La tarjeta de herramienta, oscura y arriba a la derecha de la hoja, sigue (P2b). La barra de IA sigue flotando en reposo, en los cuatro reposos (P2c), y con ella el pie del submenú Vista que tapa a 1366 × 643. En Split y en 3D siguen «mapas» y el cromo del 3D (P5). La línea base de reposo queda en vacía 3, 2D 2, Split 3 y 3D 2: la meta, 0, llega con P2c para 2D y con P5 para el resto. Y a 1280 px, en la primera carga, el grupo del patrón puede verse desplegado un instante y plegarse al llegar Inter: con la fuente de reserva los seis miden 382 px y caben en los 384 del hueco (medido con Inter bloqueada). Solo se nota si hay patrón antes de que cargue la fuente, al restaurar un proyecto; a 1366 no pasa.

---

## Mapa de archivos

| Archivo | Task | Qué cambia |
|---|---|---|
| `src/store/dockSlice.ts` | 1 | El estado se queda en `{ tools2d }`; sobre v2; lee v1 |
| `src/components/shell/LeftDock.tsx` | 1, 2 | Sin zona AUTO ni `onOpenPanel`; después, la activa de fuera |
| `src/components/shell/RightDock.tsx` | 1 | Sin zona AUTO (el resto del dock del 3D, igual hasta P5) |
| `src/components/shell/AppShell.tsx` | 1 | `<LeftDock />` |
| `src/components/shell/LogoMenu.tsx` | 1 | Fuera «Sugerencias del dock»; Vina › Patrón con Escalado y Lista de materiales; `MenuItem.panel` |
| `src/components/shell/Dock.tsx` | 1, 2 | Sin `autoZone`; después, entero: el margen |
| `src/components/shell/Dock.css` | 1, 2 | Fuera lo de AUTO; después, `.margen` y fuera `.dock--left` |
| `src/components/shell/ToolTooltip.tsx`, `.css` | 1 | Fuera `descriptionTone` |
| `src/components/shell/DockAutoZone.tsx`, `dockSuggestions.ts` y sus tests | 1 | Se borran |
| `src/components/shell/dock2dTools.ts` | 2 | `grupo` en cada herramienta |
| `src/styles/layout.css` | 2, 3 | `.canvas-area__2d` flex; la barra en rejilla; el grupo del patrón y su menú |
| `src/components/PatternEditor/PatternEditor.css` | 2 | La hoja ocupa lo que deja el margen |
| `src/components/PatternEditor/PatternEditor.tsx` | 2, 3 | Fuera `DOCK_WIDTH_PX` y la fila; `izquierda={12}` |
| `src/components/shell/TopBar.tsx` | 3 | Rejilla; el grupo del patrón |
| `src/components/PatternEditor/FilaDeCapas.tsx` | 3 | Entero: el grupo, «Mostrar» y su menú |
| `src/components/PatternEditor/FilaDeCapas.css` | 3 | Se borra |
| `scripts/deploy-prod.sh` | 4 | Dos specs más en la lista e2e |
| `tests/e2e/margen-de-herramientas.spec.ts` | 2 | Nuevo: tres casos, con barras de verdad |
| `tests/e2e/barra-superior.spec.ts` | 3 | Nuevo: tres casos |
| `src/components/shell/__tests__/TopBar.test.tsx` | 3 | Nuevo |
| `tests/e2e/*-baseline.json` | 4 | Con `*_UPDATE=1` |
| `.claude/skills/contrato-de-interfaz/SKILL.md` | 4 | § 2 y § 3 |
| `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` | 4 | Nota de § 7.2 |

Y los tests que ya existían y cambian con su tarea: `dockSlice.test.ts`, `LogoMenu.test.tsx`, `Dock.test.tsx`, `RightDock.test.tsx`, `ToolTooltip.test.tsx`, `AppShell.canaletas.test.tsx`, `las-siete-puertas-que-se-abren.test.ts` y `contextBuilder.test.ts` (Task 1); `PatternEditor.fitViewDock.test.tsx`, `shortcutSurfaces.loteA.test.tsx`, `superficies-declaradas.test.ts` y cinco e2e (Task 2); `FilaDeCapas.test.tsx`, `superficies-declaradas.test.ts`, `lo-que-flota-es-papel.test.ts`, `zIndexScale.test.ts` y `emplazamiento-lienzo-2d.spec.ts` (Task 3); `el-gate-corre-los-trinquetes.test.ts` y `contraste-del-cromo.spec.ts` (Task 4).

---


### Task 1: La zona AUTO fuera, con sus puertas, y el sobre `vina-docks` v2

La zona AUTO es lo primero que se va porque lo demás se apoya en eso: mientras `pinnedExtra` y `signaling` estén en el estado, el margen (Task 2) tendría que seguir pintando sugerencias, y el sobre persistido no podría cambiar de forma.

**Files:**
- Modify: `src/store/dockSlice.ts` (el estado se queda en `{ tools2d }`; sobre v2; `EnvelopeV1Schema` para leer el de antes)
- Modify: `src/components/shell/LeftDock.tsx`, `src/components/shell/RightDock.tsx` (sin zona AUTO; `LeftDock` deja de recibir `onOpenPanel`)
- Modify: `src/components/shell/AppShell.tsx` (`<LeftDock />`)
- Modify: `src/components/shell/LogoMenu.tsx` (fuera «Sugerencias del dock»; Vina › Patrón gana «Escalado...» y «Lista de materiales...»; `MenuItem.panel`)
- Modify: `src/components/shell/Dock.tsx` (sin la prop `autoZone`), `src/components/shell/Dock.css` (sin `.dock__sep`, `.dock__auto-label`, `.dock__tool--auto`, `.dock__tool-wrap`, `.dock__badge*`)
- Modify: `src/components/shell/ToolTooltip.tsx`, `src/components/shell/ToolTooltip.css` (sin `descriptionTone`)
- Delete: `src/components/shell/DockAutoZone.tsx`, `src/components/shell/dockSuggestions.ts`, `src/components/shell/__tests__/DockAutoZone.test.tsx`, `src/components/shell/__tests__/dockSuggestions.test.ts`
- Test: `src/store/__tests__/dockSlice.test.ts`, `src/components/shell/__tests__/LogoMenu.test.tsx`, `src/components/shell/__tests__/Dock.test.tsx`, `src/components/shell/__tests__/RightDock.test.tsx`, `src/components/shell/__tests__/ToolTooltip.test.tsx`, `src/components/shell/__tests__/AppShell.canaletas.test.tsx`, y dos fixtures: `src/components/shell/__tests__/las-siete-puertas-que-se-abren.test.ts`, `src/copilot/perception/__tests__/contextBuilder.test.ts`
- Modify: `scripts/ui-contract-baseline.json` (R5 baja de 35 a 34: `.dock__badge:hover` no tenía `:focus-visible`)

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces: `DockState = { tools2d: string[] }`; `rehydrateDocks(payload: DockState)`; `persistDocks(state: DockState)` escribe `{ version: 2, data: { tools2d } }`; `loadDocks(): DockState | null` acepta v2 y v1. `LeftDock()` sin props. `Dock` sin `autoZone`. `MenuItem.panel?: string` en `LogoMenu.tsx`. Las Tasks 2 y 3 cuentan con que `Dock.tsx` ya no pinta ninguna sugerencia.

- [ ] **Step 1: Escribir los tests**

El sobre v1 del test es la cadena de bytes que el `persistDocks` de antes dejaba en el navegador, no un objeto armado: lo que se prueba es lo que `JSON.parse` encuentra en localStorage.

En `src/store/__tests__/dockSlice.test.ts`, reemplaza:

```ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, {
  pinAuto, unpinAuto, persistDocks, loadDocks, toggleDockSignaling,
  rehydrateDocks, addDockTool, removeDockTool, resetDockTools,
  reorderDockTool, LEGACY_DEFAULT_DOCK_2D_IDS, LEGACY_DEFAULT_DOCK_2D_IDS_V2,
  LEGACY_DEFAULT_DOCK_2D_IDS_V3, LEGACY_DEFAULT_DOCK_2D_IDS_V5,
```

por:

```ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, {
  persistDocks, loadDocks,
  rehydrateDocks, addDockTool, removeDockTool, resetDockTools,
  reorderDockTool, LEGACY_DEFAULT_DOCK_2D_IDS, LEGACY_DEFAULT_DOCK_2D_IDS_V2,
  LEGACY_DEFAULT_DOCK_2D_IDS_V3, LEGACY_DEFAULT_DOCK_2D_IDS_V5,
```

En `src/store/__tests__/dockSlice.test.ts`, reemplaza:

```ts

const initial = () => dockReducer(undefined, { type: '@@INIT' });

describe('dockSlice reducers', () => {
  it('pinAuto adds an id once (idempotent)', () => {
    let s = dockReducer(initial(), pinAuto({ side: 'left', id: 'grade' }));
    s = dockReducer(s, pinAuto({ side: 'left', id: 'grade' }));
    expect(s.pinnedExtra.left).toEqual(['grade']);
    expect(s.pinnedExtra.right).toEqual([]);
  });
  it('unpinAuto removes the id', () => {
    let s = dockReducer(initial(), pinAuto({ side: 'right', id: 'bom' }));
    s = dockReducer(s, unpinAuto({ side: 'right', id: 'bom' }));
    expect(s.pinnedExtra.right).toEqual([]);
  });
});

describe('dockSlice persistence', () => {
  beforeEach(() => localStorage.clear());
  it('persistDocks → loadDocks round-trips (incl. signaling + tools2d)', () => {
    const state = { pinnedExtra: { left: ['grade'], right: ['bom'] }, signaling: 'off' as const, tools2d: ['select', 'notch'] };
    persistDocks(state);
    expect(loadDocks()).toEqual(state);
  });
  it('loadDocks returns null when nothing stored', () => {
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for a corrupt envelope', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 99, data: { pinnedExtra: { left: [], right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for wrong-typed data', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: 'nope', right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
});

describe('dockSlice signaling', () => {
  beforeEach(() => localStorage.clear());

  it('defaults signaling to subtle', () => {
    expect(initial().signaling).toBe('subtle');
  });

  it('toggleDockSignaling flips subtle → off → subtle', () => {
    let s = dockReducer(initial(), toggleDockSignaling());
    expect(s.signaling).toBe('off');
    s = dockReducer(s, toggleDockSignaling());
    expect(s.signaling).toBe('subtle');
  });

  it('rehydrateDocks sets signaling', () => {
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'off', tools2d: [...DEFAULT_DOCK_2D_IDS] }));
    expect(s.signaling).toBe('off');
  });

  it('loadDocks defaults signaling to subtle for a pre-3c envelope (no signaling key)', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] } } }));
    const loaded = loadDocks();
    expect(loaded).not.toBeNull();
    expect(loaded!.signaling).toBe('subtle');
  });

  it('loadDocks discards an envelope with an invalid signaling value', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'loud' } }));
    expect(loadDocks()).toBeNull();
  });

  it('NEW_PROJECT does not reset signaling', () => {
    const off = dockReducer(initial(), toggleDockSignaling());
    const after = dockReducer(off, { type: 'global/newProject' });
    expect(after.signaling).toBe('off');
  });
});
```

por:

```ts

const initial = () => dockReducer(undefined, { type: '@@INIT' });

/**
 * Un sobre v1 tal como lo dejaba escrito en el navegador el `persistDocks` de
 * antes de P2: la zona AUTO dentro, con algo fijado y las sugerencias apagadas,
 * y un dock personalizado. Es la cadena de bytes, no un objeto armado en el
 * test: el que lee es `JSON.parse` sobre lo que hay en localStorage.
 */
const SOBRE_V1_DE_VERDAD =
  '{"version":1,"data":{"pinnedExtra":{"left":["grade"],"right":["bom"]},"signaling":"off","tools2d":["select","pen","notch","grainline"]}}';

describe('dockSlice persistence', () => {
  beforeEach(() => localStorage.clear());
  it('persistDocks → loadDocks round-trips, en v2', () => {
    persistDocks({ tools2d: ['select', 'notch'] });
    expect(JSON.parse(localStorage.getItem('vina-docks')!)).toEqual({ version: 2, data: { tools2d: ['select', 'notch'] } });
    expect(loadDocks()).toEqual({ tools2d: ['select', 'notch'] });
  });
  it('un sobre v1 de verdad conserva el dock de la usuaria y suelta la zona AUTO', () => {
    localStorage.setItem('vina-docks', SOBRE_V1_DE_VERDAD);
    const loaded = loadDocks();
    expect(loaded).toEqual({ tools2d: ['select', 'pen', 'notch', 'grainline'] });
    persistDocks(loaded!);
    expect(JSON.parse(localStorage.getItem('vina-docks')!)).toEqual({
      version: 2, data: { tools2d: ['select', 'pen', 'notch', 'grainline'] },
    });
  });
  it('loadDocks returns null when nothing stored', () => {
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for a corrupt envelope', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 99, data: { tools2d: ['select'] } }));
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for wrong-typed v1 data', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: 'nope', right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
  it('un v2 con la zona AUTO dentro no valida: v2 nació sin ella', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 2, data: { tools2d: ['select'], signaling: 'off' } }));
    expect(loadDocks()).toBeNull();
  });
  it('un v1 de antes de `signaling` se sigue leyendo', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, tools2d: ['select', 'seam'] } }));
    expect(loadDocks()).toEqual({ tools2d: ['select', 'seam'] });
  });
});
```

En `src/store/__tests__/dockSlice.test.ts`, reemplaza:

```ts
      .filter((id) => id === 'editPattern')).toHaveLength(1);
  });

  it('loadDocks migrates a persisted historical default and round-trips it as v1', () => {
    localStorage.setItem('vina-docks', JSON.stringify({
      version: 1,
      data: {
```

por:

```ts
      .filter((id) => id === 'editPattern')).toHaveLength(1);
  });

  it('loadDocks migrates a persisted historical default and round-trips it as v2', () => {
    localStorage.setItem('vina-docks', JSON.stringify({
      version: 1,
      data: {
```

En `src/store/__tests__/dockSlice.test.ts`, reemplaza:

```ts
  });

  it('rehydrateDocks sets tools2d', () => {
    const s = dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: ['select', 'seam'] }));
    expect(s.tools2d).toEqual(['select', 'seam']);
  });
```

por:

```ts
  });

  it('rehydrateDocks sets tools2d', () => {
    const s = dockReducer(initial(), rehydrateDocks({ tools2d: ['select', 'seam'] }));
    expect(s.tools2d).toEqual(['select', 'seam']);
  });
```

En `src/store/__tests__/dockSlice.test.ts`, reemplaza:

```ts
});

describe('dockSlice reorderDockTool', () => {
  const seed = (ids: string[]) => dockReducer(initial(), rehydrateDocks({ pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: ids }));

  it('up-move: dragging a lower tool onto a higher one lands it before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'notch', toId: 'select' }));
```

por:

```ts
});

describe('dockSlice reorderDockTool', () => {
  const seed = (ids: string[]) => dockReducer(initial(), rehydrateDocks({ tools2d: ids }));

  it('up-move: dragging a lower tool onto a higher one lands it before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'notch', toId: 'select' }));
```

En `src/components/shell/__tests__/LogoMenu.test.tsx`, reemplaza:

```tsx
    expect(store.getState().simulation[field]).toBe(!before);
  });
});
```

por:

```tsx
    expect(store.getState().simulation[field]).toBe(!before);
  });
});

describe('LogoMenu ▸ Patrón — las puertas de la zona AUTO (spec 2026-10-02 § 8)', () => {
  function renderConPaneles() {
    const onOpenPanel = vi.fn();
    const store = configureStore({
      reducer: {
        editor: editorReducer,
        simulation: simulationReducer,
        dock: dockReducer,
        project: projectReducer,
        tools: toolsReducer,
        construction: constructionReducer,
        copilotUI: copilotUIReducer,
      },
    });
    render(<Provider store={store}><LogoMenu onOpenPanel={onOpenPanel} onImportDXF={() => {}} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: /vina/i }));
    fireEvent.mouseEnter(screen.getByText('Patrón'));
    return onOpenPanel;
  }

  it.each([
    ['Escalado...', 'Grading'],
    ['Lista de materiales...', 'BOM'],
  ] as const)('«%s» abre el panel %s', (rotulo, panel) => {
    const onOpenPanel = renderConPaneles();
    fireEvent.click(screen.getByText(rotulo));
    expect(onOpenPanel).toHaveBeenCalledWith(panel);
  });

  it('«Sugerencias del dock» ya no está en Vista: la zona AUTO se fue', () => {
    renderMenu();
    openViewMenu();
    expect(screen.queryByText('Sugerencias del dock')).toBeNull();
  });
});
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer, { toggleDockSignaling, pinAuto, addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
import LeftDock from '../LeftDock';

afterEach(cleanup);
```

por:

```tsx
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer, { addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
import LeftDock from '../LeftDock';

afterEach(cleanup);
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
  });
});

function renderLeftDock(onOpenPanel = vi.fn()) {
  const store = configureStore({
    reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer },
  });
  render(<Provider store={store}><LeftDock onOpenPanel={onOpenPanel} /></Provider>);
  return { store, onOpenPanel };
}

describe('LeftDock (container)', () => {
```

por:

```tsx
  });
});

function renderLeftDock() {
  const store = configureStore({
    reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer },
  });
  render(<Provider store={store}><LeftDock /></Provider>);
  return { store };
}

describe('LeftDock (container)', () => {
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
  it('is hidden in 3D-only view', () => {
    const store = configureStore({ reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer } });
    store.dispatch(setViewMode('3d'));
    render(<Provider store={store}><LeftDock onOpenPanel={vi.fn()} /></Provider>);
    expect(screen.queryByText('2D')).toBeNull();
  });

  it('shows a grade ✦ suggestion once pieces exist and runs it', () => {
    const { store, onOpenPanel } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Escalar' }));
    expect(onOpenPanel).toHaveBeenCalledWith('Grading');
  });

  it('keeps a grade suggestion (✦→📌) and records it in the dock slice', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Escalar' }));
    expect(store.getState().dock.pinnedExtra.left).toEqual(['grade']);
    expect(screen.getByRole('button', { name: 'Soltar Escalar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fijar Escalar' })).toBeNull();
  });

  it('signaling=off mutes the auto layer but shows no suggestion', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fijar Escalar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escalar' })).toBeNull();
  });

  it('off: a kept tool still renders (plain, no Unpin badge)', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(pinAuto({ side: 'left', id: 'grade' }));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.getByRole('button', { name: 'Escalar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Soltar Escalar' })).toBeNull();
  });

  // Usaba 'notch' (Piquete), que desde la auditoría de UI del 2026-08-14 viene
```

por:

```tsx
  it('is hidden in 3D-only view', () => {
    const store = configureStore({ reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer } });
    store.dispatch(setViewMode('3d'));
    render(<Provider store={store}><LeftDock /></Provider>);
    expect(screen.queryByRole('button', { name: /seleccionar · z/i })).toBeNull();
  });

  it('sin zona AUTO: con piezas no aparece ninguna sugerencia (spec 2026-10-02 § 8)', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    expect(screen.queryByRole('button', { name: 'Escalar' })).toBeNull();
    expect(screen.queryByText('auto')).toBeNull();
  });

  // Usaba 'notch' (Piquete), que desde la auditoría de UI del 2026-08-14 viene
```

En `src/components/shell/__tests__/RightDock.test.tsx`, reemplaza:

```tsx
import simulationReducer, { startSimulation, pauseSimulation, setFrameTime } from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import dockReducer, { toggleDockSignaling } from '../../../store/dockSlice';
import RightDock from '../RightDock';

afterEach(cleanup);
```

por:

```tsx
import simulationReducer, { startSimulation, pauseSimulation, setFrameTime } from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import dockReducer from '../../../store/dockSlice';
import RightDock from '../RightDock';

afterEach(cleanup);
```

En `src/components/shell/__tests__/RightDock.test.tsx`, reemplaza:

```tsx
    expect(screen.queryByText('3D')).toBeNull();
  });

  it('shows a BOM ✦ suggestion at the simulated stage and runs it', () => {
    const { store, onOpenPanel } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
    });
    fireEvent.click(screen.getByRole('button', { name: 'BOM' }));
    expect(onOpenPanel).toHaveBeenCalledWith('BOM');
  });

  it('keeps a BOM suggestion at the simulated stage', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fijar BOM' }));
    expect(store.getState().dock.pinnedExtra.right).toEqual(['bom']);
    expect(screen.getByRole('button', { name: 'Soltar BOM' })).toBeTruthy();
  });

  it('signaling=off mutes the auto layer at the simulated stage', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'BOM' })).toBeNull();
  });
});
```

por:

```tsx
    expect(screen.queryByText('3D')).toBeNull();
  });

  it('sin zona AUTO: simulada, no aparece la sugerencia de BOM (spec 2026-10-02 § 8)', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
    });
    expect(screen.queryByRole('button', { name: 'BOM' })).toBeNull();
    expect(screen.queryByText('auto')).toBeNull();
  });
});
```

En `src/components/shell/__tests__/ToolTooltip.test.tsx`, reemplaza:

```tsx
    expect(document.querySelector('.tool-tooltip-shortcut')).toBeNull();
  });

  it('applies the pin tone class to the description', () => {
    const { container } = renderTip({ name: 'Grade', description: 'you pinned this', descriptionTone: 'pin' });
    hover(container);
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.textContent).toBe('you pinned this');
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(true);
  });

  it('applies the auto tone class to the description', () => {
    const { container } = renderTip({ name: 'Grade', description: 'suggested for this stage · click ✦ to keep', descriptionTone: 'auto' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-desc')!.classList.contains('tool-tooltip-desc--auto')).toBe(true);
  });

  it('renders a plain description (no tone class) when descriptionTone is omitted', () => {
    const { container } = renderTip({ name: 'X', description: 'plain' });
    hover(container);
    const desc = document.querySelector('.tool-tooltip-desc')!;
    expect(desc.classList.contains('tool-tooltip-desc--pin')).toBe(false);
    expect(desc.classList.contains('tool-tooltip-desc--auto')).toBe(false);
  });

  it('uses the position class (right vs left)', () => {
```

por:

```tsx
    expect(document.querySelector('.tool-tooltip-shortcut')).toBeNull();
  });

  it('renders the description line', () => {
    const { container } = renderTip({ name: 'X', description: 'Crea o muestra una pieza para dibujar líneas internas.' });
    hover(container);
    expect(document.querySelector('.tool-tooltip-desc')!.textContent).toBe('Crea o muestra una pieza para dibujar líneas internas.');
  });

  it('uses the position class (right vs left)', () => {
```

En `src/components/shell/__tests__/las-siete-puertas-que-se-abren.test.ts`, reemplaza:

```ts
    // doce de fábrica. O sea: quien fije de más pierde TODA su configuración,
    // sin aviso. Con catorce en el catálogo eso era inalcanzable; con veintiuna
    // no.
    let estado: DockState = {
      pinnedExtra: { left: [], right: [] },
      signaling: 'subtle',
      tools2d: [...DEFAULT_DOCK_2D_IDS],
    };
    for (let i = 0; i < 14; i++) {
      estado = dockReducer(estado, addDockTool(`extra-${i}`));
    }
```

por:

```ts
    // doce de fábrica. O sea: quien fije de más pierde TODA su configuración,
    // sin aviso. Con catorce en el catálogo eso era inalcanzable; con veintiuna
    // no.
    let estado: DockState = { tools2d: [...DEFAULT_DOCK_2D_IDS] };
    for (let i = 0; i < 14; i++) {
      estado = dockReducer(estado, addDockTool(`extra-${i}`));
    }
```

En `src/copilot/perception/__tests__/contextBuilder.test.ts`, reemplaza:

```ts
      lastGradedAt: null,
    },
    dock: {
      pinnedExtra: { left: [], right: [] },
      signaling: 'subtle' as const,
      tools2d: ['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam'],
    },
    inputScheme: {
```

por:

```ts
      lastGradedAt: null,
    },
    dock: {
      tools2d: ['select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam'],
    },
    inputScheme: {
```

En `src/components/shell/__tests__/AppShell.canaletas.test.tsx`, reemplaza:

```tsx
  });
});

describe('los cinco sitios llaman la operación que les toca', () => {
  const src = leer();

  it('TopBar recibe togglePanel', () => {
    expect(src).toMatch(/<TopBar[\s\S]{0,80}onOpenPanel=\{togglePanel\}/);
  });

  it('LeftDock recibe togglePanel', () => {
    expect(src).toMatch(/<LeftDock[\s\S]{0,80}onOpenPanel=\{togglePanel\}/);
  });

  it('RightDock recibe togglePanel', () => {
```

por:

```tsx
  });
});

describe('los cuatro sitios llaman la operación que les toca', () => {
  const src = leer();

  it('TopBar recibe togglePanel', () => {
    expect(src).toMatch(/<TopBar[\s\S]{0,80}onOpenPanel=\{togglePanel\}/);
  });

  it('LeftDock ya no abre paneles: su única puerta a uno era la zona AUTO (spec 2026-10-02 § 8)', () => {
    expect(src).toMatch(/<LeftDock \/>/);
  });

  it('RightDock recibe togglePanel', () => {
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/store/__tests__/dockSlice.test.ts src/components/shell/__tests__/LogoMenu.test.tsx src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx src/components/shell/__tests__/ToolTooltip.test.tsx src/components/shell/__tests__/AppShell.canaletas.test.tsx`
Expected: `Tests  9 failed | 82 passed (91)`. Fallan: los tres de persistencia v2 de `dockSlice` («persistDocks → loadDocks round-trips, en v2», «un sobre v1 de verdad…», «un v1 de antes de `signaling`…»), los tres de Vina › Patrón de `LogoMenu` (no encuentran «Escalado...» ni «Lista de materiales...», y «Sugerencias del dock» todavía está), los dos «sin zona AUTO» de `Dock` y `RightDock`, y «LeftDock ya no abre paneles» de `AppShell.canaletas`.

- [ ] **Step 3: Implementar**

En `src/store/dockSlice.ts`, reemplaza:

```ts
import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

type DockSide = 'left' | 'right';

export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
  /** Auto-signaling preference. 'off' mutes ✦ suggestions + badges + the "auto"
   *  label; kept items still render as plain buttons. Default 'subtle'. */
  signaling: 'subtle' | 'off';
  /** The left (2D) dock's tool membership — ids drawn from DOCK_2D_CATALOG.
   *  Rendered in this array's order (user-reorderable via drag, slice 4b).
   *  Default DEFAULT_DOCK_2D_IDS. Min 1 (never empty). */
```

por:

```ts
import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

export interface DockState {
  /** The left (2D) dock's tool membership — ids drawn from DOCK_2D_CATALOG.
   *  Rendered in this array's order (user-reorderable via drag, slice 4b).
   *  Default DEFAULT_DOCK_2D_IDS. Min 1 (never empty). */
```

En `src/store/dockSlice.ts`, reemplaza:

```ts
}

const STORAGE_KEY = 'vina-docks';
const STORAGE_VERSION = 1;
const MAX_PINNED = 16;

/**
 * Tope de herramientas del dock 2D.
 *
 * NO es el mismo botón que `MAX_PINNED`, aunque los dos sean números parecidos:
 * `MAX_PINNED` acota las sugerencias que la usuaria se queda (`pinnedExtra`), y
 * esto acota `tools2d`, cuyos ids salen todos de `DOCK_2D_CATALOG`.
 *
 * Por qué existe: el sobre persistido valida `.max()` sobre esta lista, y zod
 * rechaza el sobre ENTERO cuando un campo no valida — `loadDocks` devuelve null
```

por:

```ts
}

const STORAGE_KEY = 'vina-docks';
/** v2 desde P2 de «la interfaz en papel» (spec 2026-10-02 § 8): la zona AUTO
 *  se fue y con ella `pinnedExtra` y `signaling`. El sobre v1 se sigue leyendo
 *  (`EnvelopeV1Schema`) para no devolverle a nadie el dock de fábrica. */
const STORAGE_VERSION = 2;
/** Tope de las sugerencias fijadas del sobre v1. Solo valida lo que se lee. */
const MAX_PINNED_V1 = 16;

/**
 * Tope de herramientas del dock 2D: acota `tools2d`, cuyos ids salen todos de
 * `DOCK_2D_CATALOG`.
 *
 * Por qué existe: el sobre persistido valida `.max()` sobre esta lista, y zod
 * rechaza el sobre ENTERO cuando un campo no valida — `loadDocks` devuelve null
```

En `src/store/dockSlice.ts`, reemplaza:

```ts
  .min(1)
  .max(MAX_ID_LEN)
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });
const sideArray = z.array(idString).max(MAX_PINNED);

const signalingSchema = z.enum(['subtle', 'off']).default('subtle');

const tools2dSchema = z.array(idString).max(MAX_DOCK_2D_TOOLS).default([...DEFAULT_DOCK_2D_IDS]);

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: signalingSchema,
    tools2d: tools2dSchema,
  })
  .strict();

const PersistedEnvelopeSchema = z
  .object({ version: z.literal(STORAGE_VERSION), data: DockStateSchema })
  .strict();

const initialState: DockState = { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: [...DEFAULT_DOCK_2D_IDS] };

/** Persist the kept-dock set to its own LS key (small per-user UI preference;
 *  LS-only, co-located in spirit with workflowSlice prefs — not project data). */
export function persistDocks(state: DockState): void {
  safeSetItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data: state }));
}

export function loadDocks(): DockState | null {
```

por:

```ts
  .min(1)
  .max(MAX_ID_LEN)
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });
const tools2dSchema = z.array(idString).max(MAX_DOCK_2D_TOOLS).default([...DEFAULT_DOCK_2D_IDS]);

const PersistedEnvelopeSchema = z
  .object({ version: z.literal(STORAGE_VERSION), data: z.object({ tools2d: tools2dSchema }).strict() })
  .strict();

/**
 * El sobre v1, tal como lo escribía `persistDocks` hasta P2: con la zona AUTO
 * dentro y `.strict()`. Si v2 no lo aceptara, `loadDocks` devolvería null y la
 * usuaria recibiría el dock de fábrica en silencio, que es justo lo que la spec
 * pide evitar (§ 8). Se lee, se descartan `pinnedExtra` y `signaling`, y se
 * conserva `tools2d`; la siguiente escritura ya sale en v2.
 */
const sideArrayV1 = z.array(idString).max(MAX_PINNED_V1);
const EnvelopeV1Schema = z
  .object({
    version: z.literal(1),
    data: z
      .object({
        pinnedExtra: z.object({ left: sideArrayV1, right: sideArrayV1 }).strict(),
        signaling: z.enum(['subtle', 'off']).default('subtle'),
        tools2d: tools2dSchema,
      })
      .strict(),
  })
  .strict();

const EnvelopeSchema = z.union([PersistedEnvelopeSchema, EnvelopeV1Schema]);

const initialState: DockState = { tools2d: [...DEFAULT_DOCK_2D_IDS] };

/** Persist the dock's tool set to its own LS key (small per-user UI preference;
 *  LS-only, co-located in spirit with workflowSlice prefs — not project data). */
export function persistDocks(state: DockState): void {
  // shape: DockState v2 — opt-in envelope: yes
  safeSetItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data: { tools2d: state.tools2d } }));
}

export function loadDocks(): DockState | null {
```

En `src/store/dockSlice.ts`, reemplaza:

```ts
  } catch {
    return null;
  }
  const result = PersistedEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[dockSlice] discarding corrupt envelope', {
      issues: result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
    return null;
  }
  const data = result.data.data;
  return { ...data, tools2d: migrateDefaultDockTools(data.tools2d) };
}

const dockSlice = createSlice({
  name: 'dock',
  initialState,
  reducers: {
    pinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      if (!state.pinnedExtra[side].includes(id)) state.pinnedExtra[side].push(id);
    },
    unpinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      state.pinnedExtra[side] = state.pinnedExtra[side].filter((x) => x !== id);
    },
    toggleDockSignaling(state) {
      state.signaling = state.signaling === 'subtle' ? 'off' : 'subtle';
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
      state.signaling = action.payload.signaling;
      state.tools2d = action.payload.tools2d;
    },
    addDockTool(state, action: PayloadAction<string>) {
```

por:

```ts
  } catch {
    return null;
  }
  const result = EnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[dockSlice] discarding corrupt envelope', {
      issues: result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
    return null;
  }
  return { tools2d: migrateDefaultDockTools(result.data.data.tools2d) };
}

const dockSlice = createSlice({
  name: 'dock',
  initialState,
  reducers: {
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.tools2d = action.payload.tools2d;
    },
    addDockTool(state, action: PayloadAction<string>) {
```

En `src/store/dockSlice.ts`, reemplaza:

```ts
  // No new-project handler: the kept set is a user preference and persists across projects.
});

export const { pinAuto, unpinAuto, rehydrateDocks, toggleDockSignaling, addDockTool, removeDockTool, resetDockTools, reorderDockTool } = dockSlice.actions;
export default dockSlice.reducer;
```

por:

```ts
  // No new-project handler: the kept set is a user preference and persists across projects.
});

export const { rehydrateDocks, addDockTool, removeDockTool, resetDockTools, reorderDockTool } = dockSlice.actions;
export default dockSlice.reducer;
```

En `src/components/shell/LeftDock.tsx`, reemplaza:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus } from 'lucide-react';
import { store, type RootState } from '../../store';
import { activate2DTool, selectHasInternalShapeHost } from '../../store/toolActivation';
import { selectWorkflowStage } from '../../store/selectors';
import { runUiExport } from '../../utils/export/uiExport';
import { pinAuto, unpinAuto, addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
import Dock from './Dock';
import DockAutoZone from './DockAutoZone';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';

interface LeftDockProps {
  onOpenPanel: (name: string) => void;
}

/** The left (2D) dock: an editable tool set + the stage-driven auto zone + a ＋
 *  customize editor. Hidden in 3D-only view. */
export default function LeftDock({ onOpenPanel }: LeftDockProps) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const hasInternalShapeHost = useSelector(selectHasInternalShapeHost);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const stage = useSelector(selectWorkflowStage);
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
  const signaling = useSelector((s: RootState) => s.dock.signaling);
  const tools2d = useSelector((s: RootState) => s.dock.tools2d);
  const [pickerOpen, setPickerOpen] = useState(false);
  // El personalizador cuelga de <body> (ver DockToolPicker): se abre donde
```

por:

```tsx
import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus } from 'lucide-react';
import type { RootState } from '../../store';
import { activate2DTool, selectHasInternalShapeHost } from '../../store/toolActivation';
import { addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
import Dock from './Dock';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';

/** The left (2D) dock: an editable tool set + a ＋ customize editor. Hidden in
 *  3D-only view. La zona AUTO se fue en P2 de «la interfaz en papel» (spec
 *  2026-10-02 § 8): Escalado y Lista de materiales están en Vina › Patrón. */
export default function LeftDock() {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const hasInternalShapeHost = useSelector(selectHasInternalShapeHost);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);
  const tools2d = useSelector((s: RootState) => s.dock.tools2d);
  const [pickerOpen, setPickerOpen] = useState(false);
  // El personalizador cuelga de <body> (ver DockToolPicker): se abre donde
```

En `src/components/shell/LeftDock.tsx`, reemplaza:

```tsx
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);

  const runSuggestion = (id: string) => {
    if (id === 'grade') onOpenPanel('Grading');
    else if (id === 'export') runUiExport('dxf', store.getState().project, dispatch);
  };

  const keptIds = pinnedExtra.left;
  const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
  const suggested = getDockSuggestions(stage, 'left').filter((s) => !keptIds.includes(s.id));

  return (
    <Dock
      domainLabel="2D"
```

por:

```tsx
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);

  return (
    <Dock
      domainLabel="2D"
```

En `src/components/shell/LeftDock.tsx`, reemplaza:

```tsx
        internalShape: 'Crea o muestra una pieza para dibujar líneas internas.',
      }}
      onReorderTool={(fromId, toId) => dispatch(reorderDockTool({ fromId, toId }))}
      autoZone={
        <DockAutoZone
          kept={kept}
          suggested={suggested}
          signaling={signaling}
          side="left"
          onRun={runSuggestion}
          onPin={(id) => dispatch(pinAuto({ side: 'left', id }))}
          onUnpin={(id) => dispatch(unpinAuto({ side: 'left', id }))}
        />
      }
      footer={
        <div ref={editorRef} className="dock-editor">
          <button
```

por:

```tsx
        internalShape: 'Crea o muestra una pieza para dibujar líneas internas.',
      }}
      onReorderTool={(fromId, toId) => dispatch(reorderDockTool({ fromId, toId }))}
      footer={
        <div ref={editorRef} className="dock-editor">
          <button
```

En `src/components/shell/RightDock.tsx`, reemplaza:

```tsx
import { useSelector, useDispatch } from 'react-redux';
import { Shirt, Spline, Play, Pause, PersonStanding } from 'lucide-react';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation, setFitMapMode } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import { selectWorkflowStage } from '../../store/selectors';
import { pinAuto, unpinAuto } from '../../store/dockSlice';
import DockShell from './DockShell';
import DockAutoZone from './DockAutoZone';
import ToolTooltip from './ToolTooltip';
import { getDockSuggestions, getAutoItemById, type DockSuggestion } from './dockSuggestions';

interface RightDockProps {
  onOpenPanel: (name: string) => void;
```

por:

```tsx
import { useSelector, useDispatch } from 'react-redux';
import { Shirt, Spline, Play, Pause, PersonStanding } from 'lucide-react';
import type { RootState } from '../../store';
import { startSimulation, pauseSimulation, setViewMode3D, resetSimulation } from '../../store/simulationSlice';
import { setActiveTool3D } from '../../store/toolSlice';
import DockShell from './DockShell';
import ToolTooltip from './ToolTooltip';

interface RightDockProps {
  onOpenPanel: (name: string) => void;
```

En `src/components/shell/RightDock.tsx`, reemplaza:

```tsx
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const frameTime = useSelector((s: RootState) => s.simulation.frameTimeMs);
  const stage = useSelector(selectWorkflowStage);
  const pinnedExtra = useSelector((s: RootState) => s.dock.pinnedExtra);
  const signaling = useSelector((s: RootState) => s.dock.signaling);

  if (viewMode === '2d') return null;
```

por:

```tsx
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const activeTool3D = useSelector((s: RootState) => s.tools.activeTool3D);
  const frameTime = useSelector((s: RootState) => s.simulation.frameTimeMs);

  if (viewMode === '2d') return null;
```

En `src/components/shell/RightDock.tsx`, reemplaza:

```tsx

  const SimIcon = simActive ? Pause : Play;

  const runSuggestion = (id: string) => {
    if (id === 'fitmap') dispatch(setFitMapMode('fit'));
    else if (id === 'bom') onOpenPanel('BOM');
  };

  return (
    <>
      <DockShell side="right" domainLabel="3D">
```

por:

```tsx

  const SimIcon = simActive ? Pause : Play;

  return (
    <>
      <DockShell side="right" domainLabel="3D">
```

En `src/components/shell/RightDock.tsx`, reemplaza:

```tsx
            <PersonStanding size={16} />
          </button>
        </ToolTooltip>
        {(() => {
          const keptIds = pinnedExtra.right;
          const kept = keptIds.map(getAutoItemById).filter((x): x is DockSuggestion => x !== undefined);
          const suggested = getDockSuggestions(stage, 'right').filter((s) => !keptIds.includes(s.id));
          return (
            <DockAutoZone
              kept={kept}
              suggested={suggested}
              signaling={signaling}
              side="right"
              onRun={runSuggestion}
              onPin={(id) => dispatch(pinAuto({ side: 'right', id }))}
              onUnpin={(id) => dispatch(unpinAuto({ side: 'right', id }))}
            />
          );
        })()}
      </DockShell>

      {simActive && (
```

por:

```tsx
            <PersonStanding size={16} />
          </button>
        </ToolTooltip>
      </DockShell>

      {simActive && (
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx
  startSimulation, pauseSimulation, resetSimulation, setViewMode3D,
  toggleGarment, toggleSeamlines3D, toggleSimSeamLines, toggleInternalLines3D,
} from '../../store/simulationSlice';
import { toggleDockSignaling } from '../../store/dockSlice';
import { requestConfirmation } from '../../hooks/useGuardedAction';
import { showErrorToast, showInfoToast } from '../../store/copilotUISlice';
import { duplicatePiece, removePieces, removeSeam, removeInternalLine, removeTramosDeInterna, removePOM, removeTramoDeTrazo } from '../../store/projectSlice';
```

por:

```tsx
  startSimulation, pauseSimulation, resetSimulation, setViewMode3D,
  toggleGarment, toggleSeamlines3D, toggleSimSeamLines, toggleInternalLines3D,
} from '../../store/simulationSlice';
import { requestConfirmation } from '../../hooks/useGuardedAction';
import { showErrorToast, showInfoToast } from '../../store/copilotUISlice';
import { duplicatePiece, removePieces, removeSeam, removeInternalLine, removeTramosDeInterna, removePOM, removeTramoDeTrazo } from '../../store/projectSlice';
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx
   * declara ninguno: se sigue clicando igual.
   */
  shortcutId?: string;
  action?: (dispatch: AppDispatch) => void;
  checked?: (state: RootState) => boolean;
  disabled?: (state: RootState) => boolean;
```

por:

```tsx
   * declara ninguno: se sigue clicando igual.
   */
  shortcutId?: string;
  /** El panel que abre (clave de `renderPanelContent`). Va por `onOpenPanel`,
   *  que alterna: por eso estos rótulos nombran el panel, no una acción. */
  panel?: string;
  action?: (dispatch: AppDispatch) => void;
  checked?: (state: RootState) => boolean;
  disabled?: (state: RootState) => boolean;
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx
  // referencia», que es la casilla de mostrar u ocultar. Es UN término para UN
  // concepto asomado dos veces —gestionar y ver—, no dos términos: eso sí
  // rompería la § 5.
  { label: 'Imágenes de referencia...', action: () => {} }, // wired via onOpenPanel('ReferenceImages')
  { separator: true, label: '' },
  // Fase1-S2: solo exports que EXISTEN. Tech Pack / 3D / Reference Image /
  // Project Settings eran noops o abrían el placeholder circular — un item
```

por:

```tsx
  // referencia», que es la casilla de mostrar u ocultar. Es UN término para UN
  // concepto asomado dos veces —gestionar y ver—, no dos términos: eso sí
  // rompería la § 5.
  { label: 'Imágenes de referencia...', panel: 'ReferenceImages' },
  { separator: true, label: '' },
  // Fase1-S2: solo exports que EXISTEN. Tech Pack / 3D / Reference Image /
  // Project Settings eran noops o abrían el placeholder circular — un item
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx
  { label: '3D: costuras en simulación', action: (d) => d(toggleSimSeamLines()), checked: (s) => s.simulation.showSimSeamLines },
  { label: '3D: líneas internas', action: (d) => d(toggleInternalLines3D()), checked: (s) => s.simulation.showInternalLines3D },
  { separator: true, label: '' },
  { label: 'Sugerencias del dock', action: (d) => d(toggleDockSignaling()), checked: (s) => s.dock.signaling === 'subtle' },
  { separator: true, label: '' },
  { label: 'Unidades: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
  { label: 'Unidades: pulgadas', action: (d) => d(setUnits('inches')), checked: (s) => s.editor.units === 'inches' },
  { label: 'Unidades: mm', action: (d) => d(setUnits('mm')), checked: (s) => s.editor.units === 'mm' },
```

por:

```tsx
  { label: '3D: costuras en simulación', action: (d) => d(toggleSimSeamLines()), checked: (s) => s.simulation.showSimSeamLines },
  { label: '3D: líneas internas', action: (d) => d(toggleInternalLines3D()), checked: (s) => s.simulation.showInternalLines3D },
  { separator: true, label: '' },
  { label: 'Unidades: cm', action: (d) => d(setUnits('cm')), checked: (s) => s.editor.units === 'cm' },
  { label: 'Unidades: pulgadas', action: (d) => d(setUnits('inches')), checked: (s) => s.editor.units === 'inches' },
  { label: 'Unidades: mm', action: (d) => d(setUnits('mm')), checked: (s) => s.editor.units === 'mm' },
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx
// Layout eran noops; Auto-Sew es el único con implementación real.
const PATTERN_MENU: MenuItem[] = [
  { label: 'Coser piezas automáticamente', action: (d) => d(runAutoSew()) },
];

const SIMULATION_MENU: MenuItem[] = [
```

por:

```tsx
// Layout eran noops; Auto-Sew es el único con implementación real.
const PATTERN_MENU: MenuItem[] = [
  { label: 'Coser piezas automáticamente', action: (d) => d(runAutoSew()) },
  { separator: true, label: '' },
  // Las dos sugerencias de la zona AUTO que no tenían otra puerta en el menú
  // (spec 2026-10-02 § 8). Exportar DXF ya estaba en Archivo; el mapa de
  // ajuste conserva la suya en el visor 3D hasta P5.
  { label: 'Escalado...', panel: 'Grading' },
  { label: 'Lista de materiales...', panel: 'BOM' },
];

const SIMULATION_MENU: MenuItem[] = [
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx
// Fase1-S2: AI Provider abría el placeholder circular (la superficie real es
// el modo settings del UnifiedBar); Keyboard Shortcuts era un noop.
const PREFERENCES_MENU: MenuItem[] = [
  { label: 'Avatar y medidas...', action: () => {} }, // wired via onOpenPanel('Avatar')
];

const HELP_MENU: MenuItem[] = [
```

por:

```tsx
// Fase1-S2: AI Provider abría el placeholder circular (la superficie real es
// el modo settings del UnifiedBar); Keyboard Shortcuts era un noop.
const PREFERENCES_MENU: MenuItem[] = [
  { label: 'Avatar y medidas...', panel: 'Avatar' },
];

const HELP_MENU: MenuItem[] = [
```

En `src/components/shell/LogoMenu.tsx`, reemplaza:

```tsx

    if (item.label === 'Importar DXF...') {
      onImportDXF();
    } else if (item.label === 'Avatar y medidas...') {
      onOpenPanel('Avatar');
    } else if (item.label === 'Imágenes de referencia...') {
      onOpenPanel('ReferenceImages');
    } else if (item.action) {
      item.action(dispatch);
    }
```

por:

```tsx

    if (item.label === 'Importar DXF...') {
      onImportDXF();
    } else if (item.panel) {
      onOpenPanel(item.panel);
    } else if (item.action) {
      item.action(dispatch);
    }
```

En `src/components/shell/AppShell.tsx`, reemplaza:

```tsx
          className="canvas-area__2d"
          style={{ flex: `${get2dFlexGrow()} 1 0px`, display: viewMode === '3d' ? 'none' : undefined }}
        >
          <LeftDock onOpenPanel={togglePanel} />
          <PatternEditor
            onImportDXF={() => dxfInputRef.current?.click()}
            onOpenPanel={openPanel}
```

por:

```tsx
          className="canvas-area__2d"
          style={{ flex: `${get2dFlexGrow()} 1 0px`, display: viewMode === '3d' ? 'none' : undefined }}
        >
          <LeftDock />
          <PatternEditor
            onImportDXF={() => dxfInputRef.current?.click()}
            onOpenPanel={openPanel}
```

En `src/components/shell/Dock.tsx`, reemplaza:

```tsx
  /** El contenedor explica por qué una herramienta no se puede activar; así
   *  el botón y su ayuda reflejan la misma condición que protege el comando. */
  disabledReasons?: Readonly<Record<string, string | undefined>>;
  /** Optional auto-suggest (✦) zone rendered below the pinned tools. */
  autoZone?: ReactNode;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
  /** When set, tool buttons become native-drag reorder sources/targets. */
```

por:

```tsx
  /** El contenedor explica por qué una herramienta no se puede activar; así
   *  el botón y su ayuda reflejan la misma condición que protege el comando. */
  disabledReasons?: Readonly<Record<string, string | undefined>>;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
  /** When set, tool buttons become native-drag reorder sources/targets. */
```

En `src/components/shell/Dock.tsx`, reemplaza:

```tsx
 * tools + active id and handles activation. When onReorderTool is provided,
 * tools can be reordered by native HTML5 drag (coexists with click-to-activate).
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, disabledReasons, autoZone, footer, onReorderTool }: DockProps) {
  const reorderable = !!onReorderTool;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
```

por:

```tsx
 * tools + active id and handles activation. When onReorderTool is provided,
 * tools can be reordered by native HTML5 drag (coexists with click-to-activate).
 */
export default function Dock({ domainLabel, tools, activeToolId, onSelectTool, disabledReasons, footer, onReorderTool }: DockProps) {
  const reorderable = !!onReorderTool;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
```

En `src/components/shell/Dock.tsx`, reemplaza:

```tsx
          </ToolTooltip>
        );
      })}
      {autoZone}
      {footer}
    </DockShell>
  );
```

por:

```tsx
          </ToolTooltip>
        );
      })}
      {footer}
    </DockShell>
  );
```

En `src/components/shell/Dock.css`, reemplaza:

```css
  cursor: not-allowed;
}

.dock__sep {
  width: 24px;
  height: 1px;
  background: var(--border);
  margin: 3px 0;
}

.dock__auto-label {
  font-family: var(--font-sans);
  font-size: 8.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.dock__tool--auto { color: var(--ai); }
.dock__tool--auto:hover { color: var(--ai); background: var(--bg-elevated); }

.dock__tool-wrap {
  position: relative;
  display: flex;
}

/* ToolTooltip wraps each item in a div; keep it transparent to the dock's
   flex column so gap/centering are unchanged. */
.dock .tool-tooltip-wrapper { display: flex; }

.dock__badge {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

/* El hover cambia tinta o borde, nunca escala ni brillo (spec § 4.4). */
.dock__badge:hover { border-color: var(--accent); }
/* Un icono de 15 px escrito con el acento va en su rol de tinta. */
.dock__badge--pin { color: var(--accent-ink); }
.dock__badge--auto { color: var(--ai); }

/* ── ＋ customize editor (slice 4) ── */
.dock-editor { position: relative; display: flex; }
```

por:

```css
  cursor: not-allowed;
}

/* ToolTooltip wraps each item in a div; keep it transparent to the dock's
   flex column so gap/centering are unchanged. */
.dock .tool-tooltip-wrapper { display: flex; }

/* ── ＋ customize editor (slice 4) ── */
.dock-editor { position: relative; display: flex; }
```

En `src/components/shell/ToolTooltip.tsx`, reemplaza:

```tsx
  name: string;
  shortcut?: string;
  description?: string;
  /** Tints the description line to match a dock badge: 'pin' → blue, 'auto' → violet. */
  descriptionTone?: 'pin' | 'auto';
  hasSubTools?: boolean;
  /** Which side the tooltip appears on. Default: 'left' */
  position?: 'left' | 'right';
  children: ReactNode;
}

export default function ToolTooltip({ name, shortcut, description, descriptionTone, hasSubTools, position = 'left', children }: ToolTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
```

por:

```tsx
  name: string;
  shortcut?: string;
  description?: string;
  hasSubTools?: boolean;
  /** Which side the tooltip appears on. Default: 'left' */
  position?: 'left' | 'right';
  children: ReactNode;
}

export default function ToolTooltip({ name, shortcut, description, hasSubTools, position = 'left', children }: ToolTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
```

En `src/components/shell/ToolTooltip.tsx`, reemplaza:

```tsx
            )}
          </div>
          {description && (
            <div className={`tool-tooltip-desc${descriptionTone ? ` tool-tooltip-desc--${descriptionTone}` : ''}`}>{description}</div>
          )}
          {hasSubTools && (
            <div className="tool-tooltip-hint">Mantén pulsado para ver variantes</div>
```

por:

```tsx
            )}
          </div>
          {description && (
            <div className="tool-tooltip-desc">{description}</div>
          )}
          {hasSubTools && (
            <div className="tool-tooltip-hint">Mantén pulsado para ver variantes</div>
```

En `src/components/shell/ToolTooltip.css`, reemplaza:

```css
  white-space: normal;
  font-family: var(--font-sans);
}
.tool-tooltip-desc--pin { color: var(--accent-ink); }
.tool-tooltip-desc--auto { color: var(--ai); }

.tool-tooltip-hint {
  font-size: var(--text-1);
```

por:

```css
  white-space: normal;
  font-family: var(--font-sans);
}

.tool-tooltip-hint {
  font-size: var(--text-1);
```

Borra `src/components/shell/DockAutoZone.tsx` (`git rm src/components/shell/DockAutoZone.tsx`).

Borra `src/components/shell/dockSuggestions.ts` (`git rm src/components/shell/dockSuggestions.ts`).

Borra `src/components/shell/__tests__/DockAutoZone.test.tsx` (`git rm src/components/shell/__tests__/DockAutoZone.test.tsx`).

Borra `src/components/shell/__tests__/dockSuggestions.test.ts` (`git rm src/components/shell/__tests__/dockSuggestions.test.ts`).

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/store/__tests__/dockSlice.test.ts src/components/shell/__tests__/LogoMenu.test.tsx src/components/shell/__tests__/Dock.test.tsx src/components/shell/__tests__/RightDock.test.tsx src/components/shell/__tests__/ToolTooltip.test.tsx src/components/shell/__tests__/AppShell.canaletas.test.tsx src/components/shell/__tests__/las-siete-puertas-que-se-abren.test.ts src/copilot/perception/__tests__/contextBuilder.test.ts`
Expected: `Test Files  8 passed (8)`, `Tests  132 passed (132)`. Los cuatro avisos `[dockSlice] discarding corrupt envelope` de stderr son de los cuatro tests que prueban sobres rotos.

Run: `npx tsc -b --noEmit`
Expected: sin salida.

- [ ] **Step 5: Bajar el techo del contrato**

Run: `node scripts/ui-contract-lint.mjs`
Expected: `R5 selectores con :hover sin :focus-visible      34      35   bajó −1` y `✓ ningún contador subió.`

Run: `node scripts/ui-contract-lint.mjs --update`

- [ ] **Step 6: Commit**

```bash
git add src/store/dockSlice.ts src/store/__tests__/dockSlice.test.ts \
  src/components/shell/LeftDock.tsx src/components/shell/RightDock.tsx src/components/shell/AppShell.tsx \
  src/components/shell/LogoMenu.tsx src/components/shell/Dock.tsx src/components/shell/Dock.css \
  src/components/shell/ToolTooltip.tsx src/components/shell/ToolTooltip.css \
  src/components/shell/__tests__/ToolTooltip.test.tsx src/components/shell/__tests__/Dock.test.tsx \
  src/components/shell/__tests__/RightDock.test.tsx src/components/shell/__tests__/LogoMenu.test.tsx \
  src/components/shell/__tests__/AppShell.canaletas.test.tsx \
  src/components/shell/__tests__/las-siete-puertas-que-se-abren.test.ts \
  src/copilot/perception/__tests__/contextBuilder.test.ts scripts/ui-contract-baseline.json
git status --short   # los cuatro borrados del Step 3 ya están en el índice (D)
git commit -m "feat(dock): fuera la zona AUTO, con sus puertas en Vina › Patrón, y el sobre del dock a v2"
```


### Task 2: El margen de herramientas del patrón

El dock deja de flotar sobre la hoja y pasa a ser su margen: una columna de papel de 44 px en el flujo de `.canvas-area__2d`. Como ya no tapa nada, el encuadre deja de descontar la faja de 62 px que se le restaba a mano, y la marca de escala deja de esquivarlo.

**Files:**
- Modify: `src/components/shell/dock2dTools.ts` (`grupo` en `DockToolDef` y en cada entrada del catálogo)
- Modify: `src/components/shell/Dock.tsx` (entero: `nav.margen`, sin `DockShell` ni rótulo; aire entre grupos; `activaFuera`; la activa se trae a la vista)
- Modify: `src/components/shell/Dock.css` (bloque `.margen`; fuera `.dock--left` y el rótulo pegajoso, que eran del dock izquierdo)
- Modify: `src/components/shell/LeftDock.tsx` (`herramientaDeFuera`, `activaFuera`; fuera `domainLabel`)
- Modify: `src/styles/layout.css` (`.canvas-area__2d` es flex), `src/components/PatternEditor/PatternEditor.css` (`.pattern-editor` ocupa lo que deja el margen)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (fuera `DOCK_WIDTH_PX`; el encuadre usa el svg entero; `izquierda={12}` en la marca de escala)
- Test: `src/components/shell/__tests__/Dock.test.tsx`, `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, `src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx`, `tests/repo/superficies-declaradas.test.ts`
- Create: `tests/e2e/margen-de-herramientas.spec.ts`
- Modify (e2e que miraban el dock viejo): `tests/e2e/superficies-por-accion.spec.ts` (fuera «el dock mide lo que DOCK_WIDTH_PX dice»), `tests/e2e/contraste-del-cromo.spec.ts`, `tests/e2e/emplazamiento-paneles.spec.ts`, `tests/e2e/las-siete-puertas.spec.ts` (`.dock--left` → `nav.margen`), `tests/e2e/tanda4-puertas-y-defaults.spec.ts` (el «fallo 9», reescrito para el margen)
- Modify (e2e del gate cuyo clic cae ahora en lo que flota): `tests/e2e/supr-con-algo-delante.spec.ts` (M6 y M7), `tests/e2e/tanda6-el-tramo-es-el-sujeto.spec.ts` y `tests/e2e/lo-que-se-ve-y-cuando.spec.ts` (D4). La hoja empieza 44 px más a la derecha, así que un punto del patrón cae 44 px más a la derecha en pantalla: tres que antes rozaban la tarjeta de herramienta o la barra de IA ahora caen dentro. Se mueven; la tarjeta se va en P2b y la barra deja el reposo en P2c.

**Interfaces:**
- Consumes: `Dock` sin `autoZone` y `LeftDock()` sin props (Task 1).
- Produces: `DockToolDef.grupo: 'editar' | 'dibujar' | 'coser'`; `Dock({ tools, activeToolId, activaFuera?, onSelectTool, disabledReasons?, footer?, onReorderTool? })` pinta `<nav class="margen" aria-label="Herramientas del patrón" data-superficie="ambiente" data-material="papel">`. `DOCK_WIDTH_PX` deja de existir. La Task 3 cuenta con que `.canvas-area__2d` sea flex y con que el margen sea `nav.margen`.

- [ ] **Step 1: Escribir los tests**

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
import projectReducer, { addPiece } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer, { addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
import LeftDock from '../LeftDock';

afterEach(cleanup);
```

por:

```tsx
import projectReducer, { addPiece } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer, { addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
import { activate2DTool } from '../../../store/toolActivation';
import LeftDock from '../LeftDock';

afterEach(cleanup);
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
  { id: 'pen', icon: Pen, label: 'Pluma', shortcut: 'H' },
];

describe('Dock (presentational)', () => {
  it('renders the domain label and one button per tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByText('2D')).toBeTruthy();
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pluma · h/i })).toBeTruthy();
  });

  it('calls onSelectTool with the tool id on click', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('marks the active tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="pen" onSelectTool={() => {}} />);
    const penBtn = screen.getByRole('button', { name: /pluma · h/i });
    expect(penBtn.className).toContain('dock__tool--active');
  });

  it('reorders on drop: dragging Select onto Pen calls onReorderTool(select, pen)', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /seleccionar · z/i }), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByRole('button', { name: /pluma · h/i }), { dataTransfer: dt });
```

por:

```tsx
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z', grupo: 'editar' as const },
  { id: 'pen', icon: Pen, label: 'Pluma', shortcut: 'H', grupo: 'dibujar' as const },
];

describe('Dock (presentational)', () => {
  it('es el margen del patrón: papel, sin rótulo «2D», un botón por herramienta', () => {
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    const margen = screen.getByRole('navigation', { name: 'Herramientas del patrón' });
    expect(margen.getAttribute('data-material')).toBe('papel');
    expect(margen.getAttribute('data-superficie')).toBe('ambiente');
    expect(screen.queryByText('2D')).toBeNull();
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pluma · h/i })).toBeTruthy();
  });

  it('entre dos grupos hay aire, y dentro de un grupo no', () => {
    const { container } = render(
      <Dock
        tools={[...TOOLS, { id: 'rectangle', icon: Pen, label: 'Rectángulo', shortcut: 'S', grupo: 'dibujar' as const }]}
        activeToolId="select"
        onSelectTool={() => {}}
      />,
    );
    // editar | dibujar, dibujar: un solo hueco, entre Seleccionar y Pluma.
    expect(container.querySelectorAll('.margen__aire')).toHaveLength(1);
  });

  it('la activa que no está en el margen se pinta al final, marcada', () => {
    const fuera = { id: 'grainline', icon: Pen, label: 'Hilo', shortcut: '⇧G', grupo: 'dibujar' as const };
    render(<Dock tools={TOOLS} activeToolId="grainline" activaFuera={fuera} onSelectTool={() => {}} />);
    const botones = screen.getAllByRole('button');
    const ultima = botones[botones.length - 1];
    expect(ultima.getAttribute('aria-label')).toMatch(/^Hilo/);
    expect(ultima.getAttribute('aria-pressed')).toBe('true');
    expect(ultima.className).toContain('dock__tool--active');
  });

  it('calls onSelectTool with the tool id on click', () => {
    const onSelectTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('marks the active tool', () => {
    render(<Dock tools={TOOLS} activeToolId="pen" onSelectTool={() => {}} />);
    const penBtn = screen.getByRole('button', { name: /pluma · h/i });
    expect(penBtn.className).toContain('dock__tool--active');
  });

  it('reorders on drop: dragging Select onto Pen calls onReorderTool(select, pen)', () => {
    const onReorderTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /seleccionar · z/i }), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByRole('button', { name: /pluma · h/i }), { dataTransfer: dt });
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx

  it('a drop onto the same tool does not reorder', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    const sel = screen.getByRole('button', { name: /seleccionar · z/i });
    fireEvent.dragStart(sel, { dataTransfer: dt });
```

por:

```tsx

  it('a drop onto the same tool does not reorder', () => {
    const onReorderTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    const sel = screen.getByRole('button', { name: /seleccionar · z/i });
    fireEvent.dragStart(sel, { dataTransfer: dt });
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
  });

  it('tool buttons are not draggable without onReorderTool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect((screen.getByRole('button', { name: /seleccionar · z/i }) as HTMLButtonElement).draggable).toBe(false);
  });

  it('clicking a tool still activates it while reorder is enabled', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} onReorderTool={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('keeps the accessible name and shows a right-positioned tooltip on hover', () => {
    vi.useFakeTimers();
    const { container } = render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    fireEvent.mouseEnter(container.querySelectorAll('.tool-tooltip-wrapper')[0]);
    act(() => { vi.advanceTimersByTime(500); });
```

por:

```tsx
  });

  it('tool buttons are not draggable without onReorderTool', () => {
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect((screen.getByRole('button', { name: /seleccionar · z/i }) as HTMLButtonElement).draggable).toBe(false);
  });

  it('clicking a tool still activates it while reorder is enabled', () => {
    const onSelectTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} onReorderTool={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('keeps the accessible name and shows a right-positioned tooltip on hover', () => {
    vi.useFakeTimers();
    const { container } = render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    fireEvent.mouseEnter(container.querySelectorAll('.tool-tooltip-wrapper')[0]);
    act(() => { vi.advanceTimersByTime(500); });
```

En `src/components/shell/__tests__/Dock.test.tsx`, reemplaza:

```tsx
    expect(screen.queryByRole('button', { name: /seleccionar · z/i })).toBeNull();
  });

  it('sin zona AUTO: con piezas no aparece ninguna sugerencia (spec 2026-10-02 § 8)', () => {
    const { store } = renderLeftDock();
    act(() => {
```

por:

```tsx
    expect(screen.queryByRole('button', { name: /seleccionar · z/i })).toBeNull();
  });

  it('la activa siempre tiene marca: una del catálogo que no está en el margen aparece al final', () => {
    const { store } = renderLeftDock();
    expect(screen.queryByRole('button', { name: /hilo/i })).toBeNull();
    act(() => { activate2DTool(store.dispatch, 'grainline'); });
    const hilo = screen.getByRole('button', { name: /hilo/i });
    expect(hilo.getAttribute('aria-pressed')).toBe('true');
    // Se va en cuanto deja de estar activa: no se queda pegada al margen.
    act(() => { activate2DTool(store.dispatch, 'select'); });
    expect(screen.queryByRole('button', { name: /hilo/i })).toBeNull();
  });

  it('y una que no es del catálogo sale con su nombre del registro (Transformar, con A)', () => {
    const { store } = renderLeftDock();
    act(() => { activate2DTool(store.dispatch, 'transform'); });
    const transformar = screen.getByRole('button', { name: 'Transformar patrón' });
    expect(transformar.getAttribute('aria-pressed')).toBe('true');
  });

  it('sin zona AUTO: con piezas no aparece ninguna sugerencia (spec 2026-10-02 § 8)', () => {
    const { store } = renderLeftDock();
    act(() => {
```

En `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, reemplaza:

```tsx
// @vitest-environment jsdom
/**
 * El dock 2D flota (`position: absolute`, § 2.1 de la spec) y no reserva
 * espacio real, así que "ajustar a la vista" tiene que descontar su faja a
 * mano — ver task-10-brief-corregido.md. jsdom no calcula layout
 * (`getBoundingClientRect` da 0 siempre y no existe `ResizeObserver`), así
 * que este test mockea las dos cosas que `handleZoomToFit` mide y afirma
 * el resultado EN EL STORE, no una llamada espiada (espiar el binding
```

por:

```tsx
// @vitest-environment jsdom
/**
 * Desde P2 de «la interfaz en papel» el margen de herramientas es una columna
 * al lado de la hoja, no encima (spec 2026-10-02 § 4.3): "ajustar a la vista"
 * encuadra en el svg entero, sin descontar ninguna faja. Hasta P2 el dock
 * flotaba y había que descontarle 62 px a mano. jsdom no calcula layout
 * (`getBoundingClientRect` da 0 siempre y no existe `ResizeObserver`), así
 * que este test mockea las dos cosas que `handleZoomToFit` mide y afirma
 * el resultado EN EL STORE, no una llamada espiada (espiar el binding
```

En `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, reemplaza:

```tsx
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece, Trazo } from '../../../types/types';
import PatternEditor, { DOCK_WIDTH_PX } from '../PatternEditor';

afterEach(() => {
  cleanup();
```

por:

```tsx
import toolReducer from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece, Trazo } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(() => {
  cleanup();
```

En `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, reemplaza:

```tsx

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;
// DOCK_WIDTH_PX viene de PatternEditor.tsx — no se repite el literal acá.

/** El doble de ResizeObserver: jsdom no lo tiene y sin él `svgSize` queda en 0,
 *  que es la otra compuerta del efecto de encuadre. */
```

por:

```tsx

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;

/** El doble de ResizeObserver: jsdom no lo tiene y sin él `svgSize` queda en 0,
 *  que es la otra compuerta del efecto de encuadre. */
```

En `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, reemplaza:

```tsx
  return { store, svg };
}

describe('PatternEditor — ajustar a la vista respeta la faja del dock', () => {
  it('descuenta el dock del ancho Y desplaza el paneo por lo mismo', () => {
    stubResizeObserver();

    const { store } = setup();
```

por:

```tsx
  return { store, svg };
}

describe('PatternEditor — ajustar a la vista encuadra en la hoja entera', () => {
  it('usa el ancho del svg y no desplaza el paneo: el margen ya no tapa la hoja', () => {
    stubResizeObserver();

    const { store } = setup();
```

En `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, reemplaza:

```tsx
      store.dispatch(requestFitView());
    });

    const esperado = computeFitView([piece], VIEWPORT_WIDTH - DOCK_WIDTH_PX, VIEWPORT_HEIGHT)!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x + DOCK_WIDTH_PX, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });
```

por:

```tsx
      store.dispatch(requestFitView());
    });

    const esperado = computeFitView([piece], VIEWPORT_WIDTH, VIEWPORT_HEIGHT)!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });
```

En `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`, reemplaza:

```tsx
    // El trazo va en coordenadas de patrón: su `path` ES el contorno, sin posición.
    const esperado = computeFitView(
      [{ position: { x: 0, y: 0 }, outline: trazo.path }],
      VIEWPORT_WIDTH - DOCK_WIDTH_PX,
      VIEWPORT_HEIGHT,
    )!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x + DOCK_WIDTH_PX, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });
```

por:

```tsx
    // El trazo va en coordenadas de patrón: su `path` ES el contorno, sin posición.
    const esperado = computeFitView(
      [{ position: { x: 0, y: 0 }, outline: trazo.path }],
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    )!;
    expect(esperado).not.toBeNull();

    expect(store.getState().editor.zoom2D).toBeCloseTo(esperado.zoom, 5);
    expect(store.getState().editor.pan2D.x).toBeCloseTo(esperado.pan.x, 5);
    expect(store.getState().editor.pan2D.y).toBeCloseTo(esperado.pan.y, 5);
  });
```

En `src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx`, reemplaza:

```tsx
  icon: Minus,
  label: 'Línea',
  shortcut: '⇧L',
};

describe('notación de atajos en las superficies del dock', () => {
  it('normaliza el aria-label del dock', () => {
    render(
      <Dock
        domainLabel="2D"
        tools={[LINE_TOOL]}
        activeToolId="line"
        onSelectTool={() => {}}
```

por:

```tsx
  icon: Minus,
  label: 'Línea',
  shortcut: '⇧L',
  grupo: 'dibujar' as const,
};

describe('notación de atajos en las superficies del dock', () => {
  it('normaliza el aria-label del dock', () => {
    render(
      <Dock
        tools={[LINE_TOOL]}
        activeToolId="line"
        onSelectTool={() => {}}
```

En `tests/repo/superficies-declaradas.test.ts`, reemplaza:

```ts
  ['src/components/shell/TopBar.tsx', 'ambiente', 1],
  ['src/components/shell/TopBar.tsx', 'dev', 1],
  ['src/components/shell/DockShell.tsx', 'ambiente', 1],
  ['src/components/PatternEditor/renderers/MarcaDeEscala.tsx', 'documento', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'ambiente', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'menu', 1],
```

por:

```ts
  ['src/components/shell/TopBar.tsx', 'ambiente', 1],
  ['src/components/shell/TopBar.tsx', 'dev', 1],
  ['src/components/shell/DockShell.tsx', 'ambiente', 1],
  ['src/components/shell/Dock.tsx', 'ambiente', 1],
  ['src/components/PatternEditor/renderers/MarcaDeEscala.tsx', 'documento', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'ambiente', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'menu', 1],
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/shell/__tests__/Dock.test.tsx src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx tests/repo/superficies-declaradas.test.ts`
Expected: `Tests  8 failed | 60 passed (68)`. Fallan los cinco nuevos de `Dock.test.tsx` (el margen, el aire, la activa de fuera y las dos de `LeftDock`), los dos del encuadre (`expected 0.9770833333333333 to be close to 1.0416666666666667`: todavía descuenta los 62 px) y «`Dock.tsx` declara "ambiente" 1 vez». El de `shortcutSurfaces` pasa: solo le faltaba `grupo` para el typecheck.

- [ ] **Step 3: Implementar**

En `src/components/shell/dock2dTools.ts`, reemplaza:

```ts
  label: string;
  /** Display shortcut (real CLO3D binding). Optional — some tools have none. */
  shortcut?: string;
}

/** Curated catalog of dock-eligible 2D tools. Render order = this order; the
 *  first 12 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is
 *  a real Tool2D union member with a canvas handler in useEditorInteractions. */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
  { id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q' },
  // Sin shortcut a propósito: CLO no le da atajo a su Add Point, y las 26
  // letras del contexto 2d están tomadas — inventarle uno enseñaría un hábito
  // que CLO rompe (maria-203).
  { id: 'point', icon: GitCommitHorizontal, label: 'Punto' },
  { id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H' },
  // 'line' murió en la unificación de líneas internas (spec 2026-08-29):
  // internalShape hereda su ranura y su atajo de dock, con G.
  // Icono propio (#1101): `Shapes` prometía «crear formas geométricas» —
  // justo la herramienta que ella creyó que era, y que además pidió aparte.
  { id: 'internalShape', icon: InternalLineIcon, label: 'Línea interna', shortcut: 'G' },
  { id: 'rectangle', icon: Square, label: 'Rectángulo', shortcut: 'S' },
  { id: 'scissors', icon: Scissors, label: 'Tijeras', shortcut: 'X' },
  { id: 'measure', icon: Ruler, label: 'Medir', shortcut: 'M' },
  // Icono propio (#1101): `Spline` era una curva bézier con sus dos nodos, y
  // ella lo leyó literalmente como «el icono de crear curvas».
  { id: 'seam', icon: SeamIcon, label: 'Coser', shortcut: 'N' },
  { id: 'seamEdit', icon: Waypoints, label: 'Editar costuras', shortcut: 'B' },
  // Margen y piquete cierran el grupo de costura, detrás de seam/seamEdit:
  // son las herramientas de #1027 y #1029 y ahora entran en el default, así
  // que van ANTES que las que quedan fuera (el catálogo abre con el default,
  // en orden — lo fija dock2dTools.test.ts).
  { id: 'seamAllowance', icon: SquareDashed, label: 'Margen de costura', shortcut: 'O' },
  // Icono propio (#1101): `Triangle` prometía un triángulo, y eso es
  // exactamente lo que ella esperaba que dibujara la herramienta.
  { id: 'notch', icon: NotchIcon, label: 'Piquete', shortcut: '⇧N' },
  // Fuera del default:
  // El círculo (#1111) entra al catálogo, no al default: las doce de fábrica
  // están medidas contra el trabajo diario de María y sacar una para meterlo
  // sería cambiarle el dock sin haberlo pedido. Con su tecla E y el
  // personalizador ya tiene puerta.
  { id: 'circle', icon: Circle, label: 'Elipse (círculo)', shortcut: 'E' },
  // El triángulo (#1111, tanda 8) entra al catálogo por la misma razón que el
  // círculo: al default no, sin cambiarle el dock a María sin que lo pidiera.
  // Sin shortcut a propósito, igual que las cinco de la tanda 6: repartir
  // mnemónicos inventados enseñaría un hábito que CLO rompe.
  { id: 'triangle', icon: TrianguloIcon, label: 'Triángulo' },
  { id: 'grainline', icon: MoveVertical, label: 'Hilo', shortcut: '⇧G' },
  // Las cinco del censo del 2026-09-05: tenían el gesto entero y ninguna
  // puerta, así que solo se alcanzaban si el copiloto las activaba por su
  // cuenta. Se ejercitaron una a una en Chrome antes de abrirles esta.
```

por:

```ts
  label: string;
  /** Display shortcut (real CLO3D binding). Optional — some tools have none. */
  shortcut?: string;
  /** Su grupo en el margen (spec 2026-10-02 § 4.3): seleccionar y editar,
   *  dibujar, coser. Entre dos grupos hay aire. */
  grupo: 'editar' | 'dibujar' | 'coser';
}

/** Curated catalog of dock-eligible 2D tools. Render order = this order; the
 *  first 12 are the default set (DEFAULT_DOCK_2D_IDS in dockSlice). Every id is
 *  a real Tool2D union member with a canvas handler in useEditorInteractions. */
export const DOCK_2D_CATALOG: DockToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z', grupo: 'editar' },
  { id: 'editPattern', icon: PenLine, label: 'Editar patrón', shortcut: 'Q', grupo: 'editar' },
  // Sin shortcut a propósito: CLO no le da atajo a su Add Point, y las 26
  // letras del contexto 2d están tomadas — inventarle uno enseñaría un hábito
  // que CLO rompe (maria-203).
  { id: 'point', icon: GitCommitHorizontal, label: 'Punto', grupo: 'editar' },
  { id: 'pen', icon: PenTool, label: 'Pluma', shortcut: 'H', grupo: 'dibujar' },
  // 'line' murió en la unificación de líneas internas (spec 2026-08-29):
  // internalShape hereda su ranura y su atajo de dock, con G.
  // Icono propio (#1101): `Shapes` prometía «crear formas geométricas» —
  // justo la herramienta que ella creyó que era, y que además pidió aparte.
  { id: 'internalShape', icon: InternalLineIcon, label: 'Línea interna', shortcut: 'G', grupo: 'dibujar' },
  { id: 'rectangle', icon: Square, label: 'Rectángulo', shortcut: 'S', grupo: 'dibujar' },
  { id: 'scissors', icon: Scissors, label: 'Tijeras', shortcut: 'X', grupo: 'dibujar' },
  { id: 'measure', icon: Ruler, label: 'Medir', shortcut: 'M', grupo: 'dibujar' },
  // Icono propio (#1101): `Spline` era una curva bézier con sus dos nodos, y
  // ella lo leyó literalmente como «el icono de crear curvas».
  { id: 'seam', icon: SeamIcon, label: 'Coser', shortcut: 'N', grupo: 'coser' },
  { id: 'seamEdit', icon: Waypoints, label: 'Editar costuras', shortcut: 'B', grupo: 'coser' },
  // Margen y piquete cierran el grupo de costura, detrás de seam/seamEdit:
  // son las herramientas de #1027 y #1029 y ahora entran en el default, así
  // que van ANTES que las que quedan fuera (el catálogo abre con el default,
  // en orden — lo fija dock2dTools.test.ts).
  { id: 'seamAllowance', icon: SquareDashed, label: 'Margen de costura', shortcut: 'O', grupo: 'coser' },
  // Icono propio (#1101): `Triangle` prometía un triángulo, y eso es
  // exactamente lo que ella esperaba que dibujara la herramienta.
  { id: 'notch', icon: NotchIcon, label: 'Piquete', shortcut: '⇧N', grupo: 'coser' },
  // Fuera del default:
  // El círculo (#1111) entra al catálogo, no al default: las doce de fábrica
  // están medidas contra el trabajo diario de María y sacar una para meterlo
  // sería cambiarle el dock sin haberlo pedido. Con su tecla E y el
  // personalizador ya tiene puerta.
  { id: 'circle', icon: Circle, label: 'Elipse (círculo)', shortcut: 'E', grupo: 'dibujar' },
  // El triángulo (#1111, tanda 8) entra al catálogo por la misma razón que el
  // círculo: al default no, sin cambiarle el dock a María sin que lo pidiera.
  // Sin shortcut a propósito, igual que las cinco de la tanda 6: repartir
  // mnemónicos inventados enseñaría un hábito que CLO rompe.
  { id: 'triangle', icon: TrianguloIcon, label: 'Triángulo', grupo: 'dibujar' },
  { id: 'grainline', icon: MoveVertical, label: 'Hilo', shortcut: '⇧G', grupo: 'dibujar' },
  // Las cinco del censo del 2026-09-05: tenían el gesto entero y ninguna
  // puerta, así que solo se alcanzaban si el copiloto las activaba por su
  // cuenta. Se ejercitaron una a una en Chrome antes de abrirles esta.
```

En `src/components/shell/dock2dTools.ts`, reemplaza:

```ts
  // letras del contexto 2d solo queda libre la `y`, y repartir mnemónicos
  // inventados entre cinco enseñaría un hábito que CLO rompe. La puerta es el
  // botón del catálogo más el personalizador ＋, que sí escala porque scrollea.
  { id: 'hand', icon: Hand, label: 'Mano' },
  { id: 'measureCurve', icon: MedirBordeIcon, label: 'Medir el borde' },
  { id: 'compareCurves', icon: CompararLargosIcon, label: 'Comparar largos' },
  { id: 'slashAndSpread', icon: AbrirPiezaIcon, label: 'Abrir la pieza' },
  { id: 'trimPlace', icon: PonerAvioIcon, label: 'Poner avío' },
  // Las otras dos del censo, que el 05-09 se quedaron fuera con su razón
  // escrita. Las dos razones eran ciertas y las dos se cerraron:
  //
```

por:

```ts
  // letras del contexto 2d solo queda libre la `y`, y repartir mnemónicos
  // inventados entre cinco enseñaría un hábito que CLO rompe. La puerta es el
  // botón del catálogo más el personalizador ＋, que sí escala porque scrollea.
  { id: 'hand', icon: Hand, label: 'Mano', grupo: 'editar' },
  { id: 'measureCurve', icon: MedirBordeIcon, label: 'Medir el borde', grupo: 'dibujar' },
  { id: 'compareCurves', icon: CompararLargosIcon, label: 'Comparar largos', grupo: 'dibujar' },
  { id: 'slashAndSpread', icon: AbrirPiezaIcon, label: 'Abrir la pieza', grupo: 'editar' },
  { id: 'trimPlace', icon: PonerAvioIcon, label: 'Poner avío', grupo: 'coser' },
  // Las otras dos del censo, que el 05-09 se quedaron fuera con su razón
  // escrita. Las dos razones eran ciertas y las dos se cerraron:
  //
```

En `src/components/shell/dock2dTools.ts`, reemplaza:

```ts
  //            el rango del borde y perdía su punto de arranque: devolvía cero
  //            pliegues en CUALQUIER borde de un comando, o sea los cuatro
  //            lados de un rectángulo.
  { id: 'elastic', icon: ElasticoIcon, label: 'Elástico' },
  { id: 'pleat', icon: PliegueIcon, label: 'Pliegue' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
```

por:

```ts
  //            el rango del borde y perdía su punto de arranque: devolvía cero
  //            pliegues en CUALQUIER borde de un comando, o sea los cuatro
  //            lados de un rectángulo.
  { id: 'elastic', icon: ElasticoIcon, label: 'Elástico', grupo: 'coser' },
  { id: 'pleat', icon: PliegueIcon, label: 'Pliegue', grupo: 'coser' },
];

export function getDockToolById(id: string): DockToolDef | undefined {
```

Reemplaza `src/components/shell/Dock.tsx` entero por:

```tsx
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import ToolTooltip from './ToolTooltip';
import type { DockToolDef } from './dock2dTools';
import { displayShortcut } from './shortcutDisplay';
import './Dock.css';

interface DockProps {
  tools: DockToolDef[];
  /** The currently active tool id (the engine truth). */
  activeToolId: string;
  /** La activa cuando no está entre `tools`: se pinta al final, marcada,
   *  mientras siga activa (spec 2026-10-02 § 4.3). */
  activaFuera?: DockToolDef;
  onSelectTool: (id: string) => void;
  /** El contenedor explica por qué una herramienta no se puede activar; así
   *  el botón y su ayuda reflejan la misma condición que protege el comando. */
  disabledReasons?: Readonly<Record<string, string | undefined>>;
  /** Optional footer (e.g. the ＋ customize editor) rendered at the very bottom. */
  footer?: ReactNode;
  /** When set, tool buttons become native-drag reorder sources/targets. */
  onReorderTool?: (fromId: string, toId: string) => void;
}

/**
 * El margen de herramientas del patrón (spec 2026-10-02 «la interfaz en papel»
 * § 4.3): una franja de 44 px del color de la hoja, pegada al borde izquierdo
 * del área 2D, con las herramientas como tinta. No flota: es una columna en el
 * flujo, así que no tapa la hoja ni se mueve con lo que pasa encima.
 *
 * Los grupos (editar, dibujar, coser) se separan por aire, no por una raya.
 * Single-select y presentacional: el contenedor da las herramientas y la
 * activa, y activa al clicar. Con `onReorderTool`, se reordenan arrastrando
 * (convive con el clic).
 */
export default function Dock({ tools, activeToolId, activaFuera, onSelectTool, disabledReasons, footer, onReorderTool }: DockProps) {
  const reorderable = !!onReorderTool;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const clearDrag = () => { setDraggingId(null); setDropTargetId(null); };
  const activaRef = useRef<HTMLButtonElement | null>(null);

  // Si no caben, el margen se desplaza; la activa se trae a la vista para que
  // su marca no quede escondida debajo del borde (spec § 4.3). jsdom no tiene
  // scrollIntoView: de ahí el `?.`.
  useEffect(() => {
    activaRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeToolId]);

  const boton = (tool: DockToolDef, i: number) => {
    const Icon = tool.icon;
    const active = tool.id === activeToolId;
    const disabledReason = disabledReasons?.[tool.id];
    const dragging = draggingId === tool.id;
    const isDropTarget = dropTargetId === tool.id && draggingId !== tool.id;
    const otroGrupo = i > 0 && tool.grupo !== tools[i - 1].grupo;
    return (
      <Fragment key={tool.id}>
        {otroGrupo && <div className="margen__aire" aria-hidden="true" />}
        <ToolTooltip name={tool.label} shortcut={tool.shortcut} description={disabledReason} position="right">
          <button
            ref={active ? activaRef : undefined}
            type="button"
            className={`dock__tool ${active ? 'dock__tool--active' : ''} ${dragging ? 'dock__tool--dragging' : ''} ${isDropTarget ? 'dock__tool--drop-target' : ''}`}
            onClick={() => onSelectTool(tool.id)}
            disabled={!!disabledReason}
            title={disabledReason}
            aria-label={tool.shortcut ? `${tool.label} · ${displayShortcut(tool.shortcut)}` : tool.label}
            aria-pressed={active}
            draggable={reorderable}
            onDragStart={reorderable ? (e) => { e.dataTransfer.setData('text/plain', tool.id); e.dataTransfer.effectAllowed = 'move'; setDraggingId(tool.id); } : undefined}
            onDragOver={reorderable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTargetId(tool.id); } : undefined}
            onDragLeave={reorderable ? () => setDropTargetId((cur) => (cur === tool.id ? null : cur)) : undefined}
            onDrop={reorderable ? (e) => { e.preventDefault(); const fromId = e.dataTransfer.getData('text/plain'); if (fromId && fromId !== tool.id) onReorderTool!(fromId, tool.id); clearDrag(); } : undefined}
            onDragEnd={reorderable ? clearDrag : undefined}
          >
            <Icon size={16} />
          </button>
        </ToolTooltip>
      </Fragment>
    );
  };

  return (
    <nav className="margen" aria-label="Herramientas del patrón" data-superficie="ambiente" data-material="papel">
      {tools.map(boton)}
      {activaFuera && (
        <>
          <div className="margen__aire" aria-hidden="true" />
          <ToolTooltip name={activaFuera.label} shortcut={activaFuera.shortcut} position="right">
            <button
              ref={activaRef}
              type="button"
              className="dock__tool dock__tool--active"
              onClick={() => onSelectTool(activaFuera.id)}
              aria-label={activaFuera.shortcut ? `${activaFuera.label} · ${displayShortcut(activaFuera.shortcut)}` : activaFuera.label}
              aria-pressed
            >
              <activaFuera.icon size={16} />
            </button>
          </ToolTooltip>
        </>
      )}
      {footer}
    </nav>
  );
}
```

En `src/components/shell/Dock.css`, reemplaza:

```css
/* Side dock — vertical tool column framing the canvas (redesign surface #4).
   Dark chrome over the light paper canvas; global tokens only. */
.dock {
  position: absolute;
  top: 50%;
```

por:

```css
/* El margen de herramientas del patrón (spec 2026-10-02 «la interfaz en papel»
   § 4.3). Es papel, no marco: el color de la hoja, y una línea de pelo la
   separa de ella. Es una columna en el flujo de `.canvas-area__2d`, no flota:
   no tapa la hoja ni se mueve con lo que pase encima. Lleva
   data-material="papel", así que `--text-*`, `--bg-elevated` y `--border` de
   `.dock__tool` y `.dock__add` son los del papel. */
.margen {
  flex: 0 0 auto;
  /* 44 px, y más solo mientras se desplaza: el ancho sale del contenido, así
     que la barra se SUMA en vez de comerse los botones (medido con barras
     clásicas el 2026-10-03: con `width: 44px` fijo quedaban 33 px útiles para
     botones de 36). Playwright esconde las barras por defecto
     (`--hide-scrollbars`): el e2e del margen las enciende. */
  width: auto;
  min-width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
  background: var(--canvas-2d);
  border-right: var(--hairline);
  /* Si no caben (hasta 22, `MAX_DOCK_2D_TOOLS`), se desplaza con la barra a la
     vista: salirse en silencio es el defecto de #1095. Fina, para que no se
     coma el ancho de los botones. */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}
/* Entre dos grupos (editar, dibujar, coser), aire; nunca una raya. */
.margen__aire { flex: 0 0 10px; }
.margen .tool-tooltip-wrapper { display: flex; }
.margen .dock__tool,
.margen .dock__add { width: 36px; height: 36px; flex-shrink: 0; }
.margen .dock-editor { margin-top: 10px; }

/* Side dock — vertical tool column framing the canvas (redesign surface #4).
   Desde P2 solo la usa el 3D (`RightDock`), hasta que P5 la vuelva margen. */
.dock {
  position: absolute;
  top: 50%;
```

En `src/components/shell/Dock.css`, reemplaza:

```css
  overflow-y: auto;
}

.dock--left { left: 14px; }
.dock--right { right: 14px; }

.dock__label {
```

por:

```css
  overflow-y: auto;
}

.dock--right { right: 14px; }

.dock__label {
```

En `src/components/shell/Dock.css`, reemplaza:

```css
  padding: 2px 0 4px;
}

/* La cabecera debe seguir ubicando el dock aunque sus herramientas se
   desplacen: el scroll conserva el acceso al catálogo completo en ventanas
   cortas, como exige #1095. El fondo opaco impide que los iconos que pasan
   por debajo se mezclen con el rótulo y parezca que la barra se movió. El rol
   del dock la mantiene por encima de los wrappers de botones, que ya tienen
   posición relativa y se pintarían después de la cabecera sin este orden. */
.dock--left .dock__label {
  position: sticky;
  top: 0;
  z-index: var(--z-dock);
  align-self: stretch;
  flex-shrink: 0;
  text-align: center;
  background: var(--surface-chrome-bg);
}

.dock__tool {
  width: 38px;
  height: 38px;
```

por:

```css
  padding: 2px 0 4px;
}

.dock__tool {
  width: 38px;
  height: 38px;
```

En `src/components/shell/LeftDock.tsx`, reemplaza:

```tsx
import type { RootState } from '../../store';
import { activate2DTool, selectHasInternalShapeHost } from '../../store/toolActivation';
import { addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
import Dock from './Dock';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';

/** The left (2D) dock: an editable tool set + a ＋ customize editor. Hidden in
 *  3D-only view. La zona AUTO se fue en P2 de «la interfaz en papel» (spec
 *  2026-10-02 § 8): Escalado y Lista de materiales están en Vina › Patrón. */
export default function LeftDock() {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
```

por:

```tsx
import type { RootState } from '../../store';
import { activate2DTool, selectHasInternalShapeHost } from '../../store/toolActivation';
import { addDockTool, removeDockTool, resetDockTools, reorderDockTool } from '../../store/dockSlice';
import { toolRegistry } from '../../tools';
import Dock from './Dock';
import DockToolPicker from './DockToolPicker';
import { DOCK_2D_CATALOG, getDockToolById, type DockToolDef } from './dock2dTools';

/**
 * La activa, cuando no está en el margen: del catálogo si es una de las suyas,
 * y si no (Transformar, con A, o una que solo abre el menú o los comandos) del
 * registro de herramientas, con su nombre en español. El grupo no se usa: va
 * sola al final, detrás de aire.
 */
function herramientaDeFuera(id: string): DockToolDef | undefined {
  const delCatalogo = getDockToolById(id);
  if (delCatalogo) return delCatalogo;
  const def = toolRegistry.getTool(id);
  // El icono del registro solo acepta `size` numérico; el margen siempre le
  // pasa 16, así que encaja en `DockIcon`.
  return def ? { id, icon: def.icon as DockToolDef['icon'], label: def.name, grupo: 'editar' } : undefined;
}

/** El margen de herramientas del patrón (spec 2026-10-02 § 4.3): las del dock
 *  de la usuaria + el ＋ que las agrega y las quita. Hidden in 3D-only view. La
 *  zona AUTO se fue en P2 (§ 8): Escalado y Lista de materiales están en
 *  Vina › Patrón. */
export default function LeftDock() {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
```

En `src/components/shell/LeftDock.tsx`, reemplaza:

```tsx
  const tools = tools2d
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);

  return (
    <Dock
      domainLabel="2D"
      tools={tools}
      activeToolId={activeTool}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      disabledReasons={hasInternalShapeHost ? undefined : {
        internalShape: 'Crea o muestra una pieza para dibujar líneas internas.',
```

por:

```tsx
  const tools = tools2d
    .map(getDockToolById)
    .filter((t): t is DockToolDef => t !== undefined);
  // La activa siempre tiene marca (spec § 4.3): si no está en el margen, se
  // pinta al final mientras siga activa.
  const activaFuera = tools.some((t) => t.id === activeTool) ? undefined : herramientaDeFuera(activeTool);

  return (
    <Dock
      tools={tools}
      activeToolId={activeTool}
      activaFuera={activaFuera}
      onSelectTool={(id) => activate2DTool(dispatch, id)}
      disabledReasons={hasInternalShapeHost ? undefined : {
        internalShape: 'Crea o muestra una pieza para dibujar líneas internas.',
```

En `src/styles/layout.css`, reemplaza:

```css
  position: relative;
  overflow: hidden;
  background: var(--canvas-2d); /* un solo papel: el del lienzo */
}

.canvas-area__divider {
```

por:

```css
  position: relative;
  overflow: hidden;
  background: var(--canvas-2d); /* un solo papel: el del lienzo */
  /* El margen de herramientas y la hoja, uno al lado de la otra (spec
     2026-10-02 § 4.3): el margen es una columna, no flota encima. */
  display: flex;
}

.canvas-area__divider {
```

En `src/components/PatternEditor/PatternEditor.css`, reemplaza:

```css
.pattern-editor {
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: crosshair;
```

por:

```css
.pattern-editor {
  /* La hoja ocupa lo que deja el margen de herramientas (layout.css). */
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  cursor: crosshair;
```

En `src/components/PatternEditor/PatternEditor.tsx`, reemplaza:

```tsx
import { selectWorkflowStage } from '../../store/selectors';
import './PatternEditor.css';

/** Faja del dock 2D izquierdo, medida en navegador (no calculada): `.dock--left`
 *  da `x=14, ancho=48` — el borde derecho cae en 62. Los 48 salen de
 *  `Dock.css`: 4px de padding + 38px de icono + 4px de padding + 1px de
 *  `--surface-chrome-border` a cada lado (2px). Hasta el 26-09 el padding era
 *  7 y la faja 68. Lo mide `superficies-por-accion.spec.ts` contra su espejo
 *  `DOCK_ANCHO`. Exportada para que el test de `handleZoomToFit` use el mismo
 *  valor en vez de repetirlo. */
export const DOCK_WIDTH_PX = 62;

/** Lo que dura en la tira el desenlace de un gesto que no pasó nada (#1117):
 *  suficiente para leerlo, corto para no quedarse contestando el gesto de antes. */
const DESENLACE_MS = 4000;
```

por:

```tsx
import { selectWorkflowStage } from '../../store/selectors';
import './PatternEditor.css';

/** Lo que dura en la tira el desenlace de un gesto que no pasó nada (#1117):
 *  suficiente para leerlo, corto para no quedarse contestando el gesto de antes. */
const DESENLACE_MS = 4000;
```

En `src/components/PatternEditor/PatternEditor.tsx`, reemplaza:

```tsx
    // teclazo repetible desde cualquier estado, así que se cierra aquí.
    if (!svgEl || (pieces.length === 0 && trazosVisibles.length === 0)) return;
    const rect = svgEl.getBoundingClientRect();
    // El dock 2D flota (no reserva espacio real, § 2.1), así que el encuadre
    // tiene que descontar su faja a mano (ver DOCK_WIDTH_PX arriba). Se resta
    // del ancho Y se desplaza el paneo por lo mismo — encuadrar en
    // [DOCK, ancho], no en [0, ancho-DOCK]. Restar sin desplazar corre el
    // patrón HACIA el dock, que es lo contrario.
    const fit = computeFitView(
      // El `path` de un trazo va en coordenadas de patrón: sin posición propia.
      [...pieces, ...trazosVisibles.map(t => ({ position: { x: 0, y: 0 }, outline: t.path }))],
      Math.max(0, rect.width - DOCK_WIDTH_PX),
      rect.height,
    );
    if (fit) {
      dispatch(setZoom2D(fit.zoom));
      dispatch(setPan2D({ x: fit.pan.x + DOCK_WIDTH_PX, y: fit.pan.y }));
    }
  }, [pieces, trazosVisibles, dispatch, svgRef]);
```

por:

```tsx
    // teclazo repetible desde cualquier estado, así que se cierra aquí.
    if (!svgEl || (pieces.length === 0 && trazosVisibles.length === 0)) return;
    const rect = svgEl.getBoundingClientRect();
    // El margen de herramientas es una columna al lado de la hoja, no encima
    // (spec 2026-10-02 § 4.3): el svg ya empieza donde termina, así que se
    // encuadra en el svg entero. Hasta P2 el dock flotaba y aquí se le
    // descontaba su faja a mano.
    const fit = computeFitView(
      // El `path` de un trazo va en coordenadas de patrón: sin posición propia.
      [...pieces, ...trazosVisibles.map(t => ({ position: { x: 0, y: 0 }, outline: t.path }))],
      rect.width,
      rect.height,
    );
    if (fit) {
      dispatch(setZoom2D(fit.zoom));
      dispatch(setPan2D(fit.pan));
    }
  }, [pieces, trazosVisibles, dispatch, svgRef]);
```

En `src/components/PatternEditor/PatternEditor.tsx`, reemplaza:

```tsx
            pan2D={pan2D}
            gridSize={gridSize}
            units={units}
            izquierda={DOCK_WIDTH_PX + 12}
          />
        )}
      </svg>
```

por:

```tsx
            pan2D={pan2D}
            gridSize={gridSize}
            units={units}
            izquierda={12}
          />
        )}
      </svg>
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/shell/__tests__/Dock.test.tsx src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx tests/repo/superficies-declaradas.test.ts`
Expected: `Test Files  4 passed (4)`, `Tests  68 passed (68)`.

Run: `npx tsc -b --noEmit`
Expected: sin salida. (Sin la conversión `def.icon as DockToolDef['icon']` de `herramientaDeFuera`, y sin el `grupo` del fixture de `shortcutSurfaces`, el typecheck falla aunque vitest esté en verde.)

- [ ] **Step 5: Los e2e del margen**

Crea `tests/e2e/margen-de-herramientas.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria } from './helpers/estados';

/**
 * El margen de herramientas del patrón (spec 2026-10-02 «la interfaz en papel»
 * § 4.3), medido en la pantalla de María: 1366 × 643, que es su Chrome en una
 * laptop de 768 (§ 12).
 *
 * Lo que jsdom no puede decir: que el margen es una columna al lado de la hoja
 * y no encima, que con las doce de fábrica no hace falta desplazarse, que con
 * el catálogo entero la barra se ve y ningún botón queda recortado, y que la
 * activa siempre tiene su marca a la vista.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

/**
 * Playwright lanza Chromium con `--hide-scrollbars`: la barra no ocupa ancho y
 * un botón que la barra recortaría en el Chrome de María pasa aquí entero
 * (medido el 2026-10-03: 33 px útiles con barras de verdad, 43 sin ellas). Se
 * encienden, conservando los argumentos de WebGL de `playwright.config.ts`.
 */
test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
    ignoreDefaultArgs: ['--hide-scrollbars'],
  },
});

const VENTANA = { width: 1366, height: 643 };

/** Lo que el margen enseña de verdad: caja del margen, de la hoja y de cada botón. */
async function medir(page: Page) {
  return page.evaluate(() => {
    const margen = document.querySelector('nav.margen') as HTMLElement;
    const hoja = document.querySelector('svg.pattern-svg')!.getBoundingClientRect();
    const m = margen.getBoundingClientRect();
    const botones = Array.from(margen.querySelectorAll<HTMLElement>('.dock__tool, .dock__add')).map((b) => {
      const r = b.getBoundingClientRect();
      return { nombre: b.getAttribute('aria-label'), left: r.left, right: r.right };
    });
    return {
      margen: { left: m.left, right: m.right, width: m.width },
      hojaLeft: hoja.left,
      desborda: margen.scrollHeight > margen.clientHeight,
      // El ancho útil dentro del margen, sin la barra de desplazamiento.
      utilRight: m.left + margen.clientWidth,
      fondo: getComputedStyle(margen).backgroundColor,
      papel: getComputedStyle(document.querySelector('.canvas-area__2d')!).backgroundColor,
      botones,
    };
  });
}

test('con las doce de fábrica: una columna de papel al lado de la hoja, sin desplazarse', async ({ page }) => {
  await page.setViewportSize(VENTANA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  const r = await medir(page);
  expect(r.margen.left, 'el margen no está pegado al borde del área 2D').toBe(0);
  expect(Math.round(r.margen.width), 'el margen no mide 44 px').toBe(44);
  expect(r.hojaLeft, 'la hoja empieza debajo del margen: el margen la tapa').toBeGreaterThanOrEqual(r.margen.right);
  expect(r.fondo, 'el margen no es del color de la hoja').toBe(r.papel);
  expect(r.desborda, 'a 1366 × 643 las doce y el «+» no caben sin desplazarse').toBe(false);
  expect(r.botones).toHaveLength(13);
});

test('con el catálogo entero: la barra se ve, ningún botón queda recortado y la activa se trae a la vista', async ({ page }) => {
  await page.setViewportSize(VENTANA);
  // El sobre v2 con las 22 del catálogo, escrito antes de que arranque la app.
  await page.addInitScript(() => {
    const todas = [
      'select', 'editPattern', 'point', 'pen', 'internalShape', 'rectangle', 'scissors', 'measure',
      'seam', 'seamEdit', 'seamAllowance', 'notch', 'circle', 'triangle', 'grainline', 'hand',
      'measureCurve', 'compareCurves', 'slashAndSpread', 'trimPlace', 'elastic', 'pleat',
    ];
    localStorage.setItem('vina-docks', JSON.stringify({ version: 2, data: { tools2d: todas } }));
    localStorage.removeItem('vina-bar-position');
  });
  await page.goto('/app/');
  await expect(page.locator('svg.pattern-svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pill-group').getByRole('button', { name: '2D', exact: true }).click();
  await page.waitForTimeout(400);

  const r = await medir(page);
  expect(r.botones).toHaveLength(23);
  expect(r.desborda, 'con 22 herramientas el margen tendría que desplazarse').toBe(true);
  expect(r.utilRight, 'la barra no ocupa ancho: el test no está viendo barras de verdad').toBeLessThan(r.margen.right - 2);
  // Recortado = el botón se sale del ancho útil (la barra de desplazamiento
  // se lo come). El clic de Playwright desplaza el contenedor y lo alcanza
  // igual: por eso se mide la caja y no el clic.
  const recortados = r.botones.filter((b) => b.right > r.utilRight + 0.5 || b.left < r.margen.left - 0.5);
  expect(recortados, 'botones recortados por la barra de desplazamiento').toEqual([]);

  // Abajo del todo, Pliegue; con Z se vuelve a Seleccionar, que está arriba.
  const margen = page.locator('nav.margen');
  await margen.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.getByRole('button', { name: 'Pliegue', exact: true }).click();
  await page.locator('svg.pattern-svg').hover({ position: { x: 400, y: 300 } });
  await page.keyboard.press('z');
  const seleccionarALaVista = await page.evaluate(() => {
    const margenEl = document.querySelector('nav.margen')!.getBoundingClientRect();
    const b = document.querySelector('nav.margen .dock__tool--active')!.getBoundingClientRect();
    return b.top >= margenEl.top - 0.5 && b.bottom <= margenEl.bottom + 0.5;
  });
  expect(seleccionarALaVista, 'la activa quedó fuera de la vista del margen').toBe(true);
});

test('la activa que no está en el margen aparece al final, marcada, y se va al soltarla', async ({ page }) => {
  await page.setViewportSize(VENTANA);
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await page.locator('svg.pattern-svg').hover({ position: { x: 400, y: 300 } });
  await page.keyboard.press('Shift+G');
  const hilo = page.locator('nav.margen').getByRole('button', { name: /^Hilo/ });
  await expect(hilo).toHaveAttribute('aria-pressed', 'true');
  // Que se vea de verdad: lo de arriba en su centro es el propio botón.
  const encima = await hilo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === el;
  });
  expect(encima, 'la marca de la activa está tapada').toBe(true);
  await page.keyboard.press('z');
  await expect(page.locator('nav.margen').getByRole('button', { name: /^Hilo/ })).toHaveCount(0);
});
```

En `tests/e2e/superficies-por-accion.spec.ts`, reemplaza:

```ts
 * base al final con SUPERFICIES_UPDATE=1.
 */
const BASELINE = 'tests/e2e/superficies-baseline.json';
/** Espejo de `DOCK_WIDTH_PX` (PatternEditor.tsx): borde derecho del dock izquierdo, en px. */
const DOCK_ANCHO = 62;

const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};
```

por:

```ts
 * base al final con SUPERFICIES_UPDATE=1.
 */
const BASELINE = 'tests/e2e/superficies-baseline.json';

const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};
```

En `tests/e2e/superficies-por-accion.spec.ts`, reemplaza:

```ts
    ]));
  });
});

test('el dock mide lo que DOCK_WIDTH_PX dice', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirAppVacia(page);
  const caja = await page.locator('.dock--left').boundingBox();
  expect(caja).not.toBeNull();
  expect(Math.round(caja!.x + caja!.width), 'el borde derecho del dock y DOCK_WIDTH_PX divergen').toBe(DOCK_ANCHO);
});
```

por:

```ts
    ]));
  });
});
```

En `tests/e2e/contraste-del-cromo.spec.ts`, reemplaza:

```ts
  await page.keyboard.press('Escape');
  await expect(page.locator('.confirm-dialog')).toHaveCount(0);

  await page.locator('.dock--left .dock__tool').first().hover();
  await expect(page.locator('.tool-tooltip')).toBeVisible({ timeout: 3_000 });
  await page.waitForTimeout(200);
  await registrar('tooltip', page);
```

por:

```ts
  await page.keyboard.press('Escape');
  await expect(page.locator('.confirm-dialog')).toHaveCount(0);

  await page.locator('nav.margen .dock__tool').first().hover();
  await expect(page.locator('.tool-tooltip')).toBeVisible({ timeout: 3_000 });
  await page.waitForTimeout(200);
  await registrar('tooltip', page);
```

En `tests/e2e/emplazamiento-paneles.spec.ts`, reemplaza:

```ts
      return g ? g.getBoundingClientRect().left : -1;
    });
    const bordeDerechoDelDock = await page.evaluate(() => {
      const dock = document.querySelector('.dock--left');
      return dock ? dock.getBoundingClientRect().right : -1;
    });
```

por:

```ts
      return g ? g.getBoundingClientRect().left : -1;
    });
    const bordeDerechoDelDock = await page.evaluate(() => {
      const dock = document.querySelector('nav.margen');
      return dock ? dock.getBoundingClientRect().right : -1;
    });
```

En `tests/e2e/las-siete-puertas.spec.ts`, reemplaza:

```ts
    await page.waitForTimeout(600);

    const medida = await page.evaluate(() => {
      const d = document.querySelector('.dock--left') as HTMLElement | null;
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const scrollea = d.scrollHeight > d.clientHeight + 1;
```

por:

```ts
    await page.waitForTimeout(600);

    const medida = await page.evaluate(() => {
      const d = document.querySelector('nav.margen') as HTMLElement | null;
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const scrollea = d.scrollHeight > d.clientHeight + 1;
```

En `tests/e2e/tanda4-puertas-y-defaults.spec.ts`, reemplaza:

```ts
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 3000 }).toBe('internalShape');
  });

  test('fallo 9 — el dock se desplaza pero su cabecera no se va', async ({ page }) => {
    // Ventana corta a propósito: es la condición que hace scrollear el dock, y
    // es la que ella tenía. Sin esto el caso pasa sin probar nada.
    await page.setViewportSize({ width: 1280, height: 520 });
    await waitForApp(page);

    const dock = page.locator('.dock--left');
    const rotulo = dock.locator('.dock__label').first();
    await expect(rotulo, 'el rótulo "2D" está a la vista antes de tocar nada').toBeVisible();

    const alcanzable = await dock.evaluate(el => el.scrollHeight - el.clientHeight);
    expect(alcanzable, 'el dock tiene que desbordar para que este caso mida algo').toBeGreaterThan(0);

    await dock.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(200);

    // Lo que ella vio: el rótulo se fue con el scroll y la barra "se bajó".
    const cajaRotulo = await rotulo.boundingBox();
    const cajaDock = await dock.boundingBox();
    expect(cajaRotulo, 'el rótulo tiene que seguir teniendo caja').not.toBeNull();
    expect(cajaDock).not.toBeNull();
    // El assert tiene que ser "no se fue por ARRIBA", no "está cerca de
    // arriba": un rótulo que se va con el scroll queda POR ENCIMA del dock, y
    // un `y < dockY + 40` se cumpliría igual. Una comprobación floja da señal
    // falsa y pasa en verde con el fallo dentro.
    expect(
      cajaRotulo!.y,
      'con el dock desplazado hasta abajo, el rótulo no puede haberse ido por arriba',
    ).toBeGreaterThanOrEqual(cajaDock!.y - 1);
  });

  test('fallo 4 — Largos es un interruptor apagado de fábrica, y seleccionar una pieza no lo enciende', async ({ page }) => {
```

por:

```ts
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 3000 }).toBe('internalShape');
  });

  test('fallo 9 — el margen se desplaza por dentro: la columna no se mueve', async ({ page }) => {
    // Ventana corta a propósito: es la condición que hace desplazarse el
    // margen, y es la que ella tenía. Lo que vio fue el dock «bajarse» cuando
    // su rótulo «2D» se iba con el scroll. El margen ya no tiene rótulo (spec
    // 2026-10-02 § 4.3): lo que queda por medir es que la columna se queda
    // quieta y solo viajan las herramientas.
    await page.setViewportSize({ width: 1280, height: 520 });
    await waitForApp(page);

    const margen = page.locator('nav.margen');
    const alcanzable = await margen.evaluate(el => el.scrollHeight - el.clientHeight);
    expect(alcanzable, 'el margen tiene que desbordar para que este caso mida algo').toBeGreaterThan(0);

    const antes = await margen.boundingBox();
    await margen.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(200);
    expect(await margen.boundingBox(), 'con el margen desplazado hasta abajo, la columna se movió').toEqual(antes);
  });

  test('fallo 4 — Largos es un interruptor apagado de fábrica, y seleccionar una pieza no lo enciende', async ({ page }) => {
```

Y los tres del gate cuyo clic cae ahora en lo que flota:

En `tests/e2e/supr-con-algo-delante.spec.ts`, reemplaza:

```ts
  test('M6 · con mediciones en pantalla, Supr no se lleva la pieza', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 300, y: 100 });
    await page.waitForTimeout(300);
    await expect(botonBorrarMediciones(page), 'el caso no se ejerce: los clics no midieron nada')
      .toBeEnabled();
```

por:

```ts
  test('M6 · con mediciones en pantalla, Supr no se lleva la pieza', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    // A la izquierda de la tarjeta de herramienta, que en Split a 1280 empieza
    // en x 326: desde que el margen corre la hoja 44 px, el (300, 100) de antes
    // caía dentro de ella (P2a). P2b la borra.
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 250, y: 100 });
    await page.waitForTimeout(300);
    await expect(botonBorrarMediciones(page), 'el caso no se ejerce: los clics no midieron nada')
      .toBeEnabled();
```

En `tests/e2e/supr-con-algo-delante.spec.ts`, reemplaza:

```ts
  test('M7 · Retroceso hace lo mismo que Supr midiendo', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 300, y: 100 });
    await page.waitForTimeout(300);

    await expect(botonBorrarMediciones(page), 'el caso no se ejerce: los clics no midieron nada')
```

por:

```ts
  test('M7 · Retroceso hace lo mismo que Supr midiendo', async ({ page }) => {
    await conPiezaSeleccionada(page);
    await activarHerramienta(page, 'm', 'measure');
    // A la izquierda de la tarjeta de herramienta, que en Split a 1280 empieza
    // en x 326: desde que el margen corre la hoja 44 px, el (300, 100) de antes
    // caía dentro de ella (P2a). P2b la borra.
    await clickAt(page, { x: 100, y: 100 });
    await clickAt(page, { x: 250, y: 100 });
    await page.waitForTimeout(300);

    await expect(botonBorrarMediciones(page), 'el caso no se ejerce: los clics no midieron nada')
```

En `tests/e2e/tanda6-el-tramo-es-el-sujeto.spec.ts`, reemplaza:

```ts

    // Tres nodos y vuelta al primero: `usePolyPenTool` cierra al clicar sobre el
    // nodo 0 con tres ya puestos, y `nodesToCommands` remata el path con `Z`.
    const triangulo = [{ x: 120, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 220 }];
    for (const p of triangulo) await clicEn(page, p);
    await clicEn(page, triangulo[0]);
    await page.waitForTimeout(400);
```

por:

```ts

    // Tres nodos y vuelta al primero: `usePolyPenTool` cierra al clicar sobre el
    // nodo 0 con tres ya puestos, y `nodesToCommands` remata el path con `Z`.
    // Lejos de la tarjeta de herramienta (en Split a 1280 empieza en x 326):
    // con el margen, el (300, 100) de antes caía dentro de ella (P2a).
    const triangulo = [{ x: 120, y: 100 }, { x: 260, y: 100 }, { x: 260, y: 220 }];
    for (const p of triangulo) await clicEn(page, p);
    await clicEn(page, triangulo[0]);
    await page.waitForTimeout(400);
```

En `tests/e2e/lo-que-se-ve-y-cuando.spec.ts`, reemplaza:

```ts
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    for (const p of [{ x: 150, y: 500 }, { x: 350, y: 500 }, { x: 350, y: 640 }]) await clicEn(page, p);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await st(page)).project.pieces.length, { timeout: 5000 }).toBe(1);
```

por:

```ts
    await page.keyboard.press('h');
    await expect.poll(async () => (await st(page)).editor.activeTool, { timeout: 5000 }).toBe('pen');

    // Por encima de la barra de IA y de la fila de capas, que en reposo viven
    // en el pie de la hoja: desde que el margen corre la hoja 44 px, el
    // (350, 640) de antes caía dentro de la barra (P2a). P2c la saca del
    // reposo; la fila sube a la barra superior en la tarea siguiente.
    for (const p of [{ x: 150, y: 400 }, { x: 350, y: 400 }, { x: 350, y: 520 }]) await clicEn(page, p);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await st(page)).project.pieces.length, { timeout: 5000 }).toBe(1);
```

Run: `npx playwright test tests/e2e/margen-de-herramientas.spec.ts tests/e2e/tanda4-puertas-y-defaults.spec.ts tests/e2e/las-siete-puertas.spec.ts tests/e2e/emplazamiento-paneles.spec.ts tests/e2e/supr-con-algo-delante.spec.ts tests/e2e/tanda6-el-tramo-es-el-sujeto.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts --retries=0 --workers=2`
Expected: `60 passed`: 3 del margen, 4 de tanda 4, 16 de las siete puertas, 9 de emplazamiento de paneles, 12 de Supr con algo delante, 8 de tanda 6 y 8 de lo que se ve. (Medido sobre el estado de esta tarea, con la fila de capas todavía en el lienzo: por eso el D4 de lo que se ve sube sus puntos por encima de ella y no solo de la barra.)

Comprobar que el e2e del catálogo entero mide de verdad: en `src/components/shell/Dock.css`, cambia `  width: auto;` (la primera, la de `.margen`) por `  width: 44px;` y corre `npx playwright test tests/e2e/margen-de-herramientas.spec.ts -g "catálogo entero" --retries=0 --workers=1`. Expected: `1 failed`, con `botones recortados por la barra de desplazamiento`. Devuelve `  width: auto;`.

- [ ] **Step 6: Mirarlo**

A 1366 × 643, en Split y en 2D, con el DXF de María: el margen a la izquierda de la hoja, sin rótulo, con los tres grupos separados por aire y la activa en azul; con ⇧G, «Hilo» aparece al final, marcado. Capturas en `docs/reports/ui-audit-2026-10-02-hoy/capturas/` con `node docs/reports/ui-audit-2026-10-02-hoy/maquetas/p2a-capturas.mjs` (carpeta fuera de git; el script está en la sección «Capturas» al final de este plan).

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/dock2dTools.ts src/components/shell/Dock.tsx src/components/shell/Dock.css \
  src/components/shell/LeftDock.tsx src/styles/layout.css src/components/PatternEditor/PatternEditor.css \
  src/components/PatternEditor/PatternEditor.tsx \
  src/components/shell/__tests__/Dock.test.tsx src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx \
  src/components/shell/__tests__/shortcutSurfaces.loteA.test.tsx tests/repo/superficies-declaradas.test.ts \
  tests/e2e/margen-de-herramientas.spec.ts tests/e2e/superficies-por-accion.spec.ts tests/e2e/contraste-del-cromo.spec.ts \
  tests/e2e/emplazamiento-paneles.spec.ts tests/e2e/las-siete-puertas.spec.ts tests/e2e/tanda4-puertas-y-defaults.spec.ts \
  tests/e2e/supr-con-algo-delante.spec.ts tests/e2e/tanda6-el-tramo-es-el-sujeto.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts
git commit -m "feat(lienzo): el margen de herramientas del patrón — una columna de papel, no un dock que flota"
```


### Task 3: La barra superior: el selector en el centro y el grupo del patrón

Los seis interruptores dejan el lienzo y suben a la barra superior, entre rehacer y el selector de vista. La barra pasa a una rejilla de tres columnas para que el selector quede en el centro de la ventana sin depender de sus vecinos. Si los seis no caben, se pliegan en «Mostrar».

**Files:**
- Modify: `src/components/shell/TopBar.tsx` (rejilla de tres columnas; el grupo del patrón, en 2D o Split con piezas o trazos; fuera los dos `.top-bar__spacer`)
- Modify: `src/components/PatternEditor/FilaDeCapas.tsx` (entero: clases `.grupo-del-patron*`, nombre «Qué se ve del patrón», `useNoCabe`, el botón «Mostrar» y su menú en un portal de papel)
- Delete: `src/components/PatternEditor/FilaDeCapas.css` (la tarjeta)
- Modify: `src/styles/layout.css` (`.top-bar` en rejilla, `.top-bar__lado`, y los estilos del grupo y de su menú)
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (la fila ya no se monta en el lienzo)
- Test: `src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx`, Create: `src/components/shell/__tests__/TopBar.test.tsx`, Modify: `tests/repo/superficies-declaradas.test.ts` (el vocabulario pierde `fila`; `FilaDeCapas.tsx` declara un `menu`), `tests/repo/lo-que-flota-es-papel.test.ts` (el menú de «Mostrar» y el margen son papel), `src/styles/__tests__/zIndexScale.test.ts` (fuera la fila; dentro el menú de «Mostrar» en `--z-menu`)
- Create: `tests/e2e/barra-superior.spec.ts`
- Modify: `tests/e2e/emplazamiento-lienzo-2d.spec.ts` (F1 y F2 miden contra `.grupo-del-patron`, con una pieza para que el grupo exista)
- Modify (e2e del gate que pulsan un interruptor a 1280, donde el grupo se pliega): `tests/e2e/1152-los-largos-no-se-quedan-clavados.spec.ts`, `tests/e2e/lo-que-se-ve-y-cuando.spec.ts` (D1 y D3), `tests/e2e/seis-firmas-maria.spec.ts` (D1), `tests/e2e/tanda4-puertas-y-defaults.spec.ts` («fallo 4») y `tests/e2e/trazos.spec.ts` («Construcción»). El viewport de estos e2e es el de `Desktop Chrome`, 1280 × 720; se miden a 1366 × 768, la pantalla de María. El plegado lo prueba `barra-superior.spec.ts`.

**Interfaces:**
- Consumes: `.canvas-area__2d` flex y `nav.margen` (Task 2), sin efecto aquí.
- Produces: `FilaDeCapas()` pinta `<div class="grupo-del-patron">` con `role="group"` y `aria-label="Qué se ve del patrón"` (desplegado) o un botón «Mostrar» con `aria-controls="grupo-del-patron-menu"` cuyo menú cuelga de `<body>` con el mismo nombre, `data-superficie="menu"` y `data-material="papel"`. `TopBar` tiene exactamente tres hijos: `.top-bar__lado`, `.pill-group`, `.top-bar__lado--derecho`. La Task 4 mide estos nombres.

- [ ] **Step 1: Escribir los tests**

El plegado no se puede medir en jsdom: el test le da a la fila un hueco de 300 px y un ancho natural de 402 con `vi.spyOn(Element.prototype, …)` y un `ResizeObserver` de mentira que avisa al observar. El caso de la Review Focus 3 cambia el hueco con el menú abierto y vuelve a avisar.

En `src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx`, reemplaza:

```tsx
// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import editorReducer from '../../../store/editorSlice';
import FilaDeCapas from '../FilaDeCapas';

afterEach(cleanup);

const interruptores = [
  ['Margen', 'showSeamAllowance'],
```

por:

```tsx
// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import editorReducer from '../../../store/editorSlice';
import FilaDeCapas from '../FilaDeCapas';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const interruptores = [
  ['Margen', 'showSeamAllowance'],
```

En `src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx`, reemplaza:

```tsx
      </Provider>,
    );

    const group = screen.getByRole('group', { name: 'Capas visibles' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Margen', 'Hilo', 'Piquetes', 'Costuras', 'Largos', 'Construcción',
```

por:

```tsx
      </Provider>,
    );

    const group = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Margen', 'Hilo', 'Piquetes', 'Costuras', 'Largos', 'Construcción',
```

En `src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx`, reemplaza:

```tsx
    expect(store.getState().editor.showTrazos).toBe(false);
  });
});
```

por:

```tsx
    expect(store.getState().editor.showTrazos).toBe(false);
  });
});

describe('FilaDeCapas plegada: cuando los seis no caben (spec 2026-10-02 § 4.2)', () => {
  /** jsdom no mide: un hueco de 300 px para una fila que pide 402. */
  function sinSitio() {
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe() { this.cb([], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(402);
  }

  it('se pliegan en «Mostrar», que abre un menú de papel con los seis', () => {
    sinSitio();
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);

    expect(screen.queryByRole('group', { name: 'Qué se ve del patrón' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));

    const menu = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    expect(menu.getAttribute('data-material'), 'un portal nace papel').toBe('papel');
    expect(menu.parentElement, 'el menú cuelga de <body>').toBe(document.body);
    expect(within(menu).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Margen', 'Hilo', 'Piquetes', 'Costuras', 'Largos', 'Construcción',
    ]);

    fireEvent.click(within(menu).getByRole('button', { name: 'Hilo' }));
    expect(store.getState().editor.showGrainlines, 'el interruptor de dentro no despacha').toBe(false);
  });

  it('si con el menú abierto vuelven a caber, el menú se cierra y los seis vuelven a la barra', () => {
    let avisar: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; avisar = () => this.cb([], this as unknown as ResizeObserver); }
      observe() { this.cb([], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    const hueco = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(402);
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(document.querySelector('.grupo-del-patron__menu')).not.toBeNull();

    // La ventana crece: el hueco pasa a 500 y el observador avisa.
    hueco.mockReturnValue(500);
    act(() => { avisar(); });

    expect(document.querySelector('.grupo-del-patron__menu'), 'el menú siguió colgando de <body>').toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Qué se ve del patrón' })).getAllByRole('button')).toHaveLength(6);

    // Y si vuelve a encoger, «Mostrar» vuelve cerrado: nadie lo abrió.
    hueco.mockReturnValue(300);
    act(() => { avisar(); });
    expect(screen.getByRole('button', { name: 'Mostrar' }).getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.grupo-del-patron__menu'), 'el menú se reabrió solo').toBeNull();
  });

  it('Escape lo cierra y devuelve el foco a «Mostrar»', () => {
    sinSitio();
    const store = configureStore({ reducer: { editor: editorReducer } });
    render(<Provider store={store}><FilaDeCapas /></Provider>);
    const mostrar = screen.getByRole('button', { name: 'Mostrar' });
    fireEvent.click(mostrar);
    const menu = screen.getByRole('group', { name: 'Qué se ve del patrón' });
    within(menu).getByRole('button', { name: 'Margen' }).focus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('group', { name: 'Qué se ve del patrón' })).toBeNull();
    expect(document.activeElement).toBe(mostrar);
  });
});
```

Crea `src/components/shell/__tests__/TopBar.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 *
 * La barra superior (spec 2026-10-02 «la interfaz en papel» § 4.2): el grupo
 * del patrón está cuando la hoja está a la vista y hay algo dibujado en ella.
 * Que el selector de vista quede centrado y no se mueva es layout: lo mide
 * `tests/e2e/barra-superior.spec.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import projectReducer, { addPiece, addTrazo } from '../../../store/projectSlice';
import TopBar from '../TopBar';

afterEach(cleanup);

function renderBarra() {
  const store = configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer, project: projectReducer },
  });
  render(<Provider store={store}><TopBar onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
  return store;
}

const grupo = () => screen.queryByRole('group', { name: 'Qué se ve del patrón' });

const PIEZA = {
  id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false,
};

describe('TopBar ▸ grupo del patrón', () => {
  it('sin nada en la hoja no está', () => {
    renderBarra();
    expect(grupo()).toBeNull();
  });

  it('con una pieza está en Split y en 2D, y en 3D no', () => {
    const store = renderBarra();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    act(() => { store.dispatch(addPiece(PIEZA as any)); });
    expect(store.getState().editor.viewMode).toBe('split');
    expect(grupo()).not.toBeNull();
    act(() => { store.dispatch(setViewMode('2d')); });
    expect(grupo()).not.toBeNull();
    act(() => { store.dispatch(setViewMode('3d')); });
    expect(grupo()).toBeNull();
  });

  it('con un trazo y ninguna pieza también está', () => {
    const store = renderBarra();
    act(() => {
      store.dispatch(addTrazo({
        id: 't1', createdAt: 0,
        path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }],
      }));
    });
    expect(grupo()).not.toBeNull();
  });

  it('el selector de vista ya no vive entre dos espaciadores', () => {
    const { container } = render(
      <Provider store={configureStore({ reducer: { editor: editorReducer, simulation: simulationReducer, project: projectReducer } })}>
        <TopBar onOpenPanel={() => {}} onImportDXF={() => {}} />
      </Provider>,
    );
    expect(container.querySelector('.top-bar__spacer')).toBeNull();
    expect(container.querySelectorAll('.top-bar > *')).toHaveLength(3);
  });
});
```

En `tests/repo/superficies-declaradas.test.ts`, reemplaza:

```ts
 */
export const VOCABULARIO = new Set([
  'ambiente', 'documento', 'dev',
  'tira', 'fila', 'pista', 'barra', 'paleta', 'velo', 'cabina', 'menu', 'panel',
  'modal', 'toast', 'tooltip', 'estado-vacio', 'indicador-simulacion',
  'indicador-fps', 'mapas', 'instantaneas',
]);
```

por:

```ts
 */
export const VOCABULARIO = new Set([
  'ambiente', 'documento', 'dev',
  'tira', 'pista', 'barra', 'paleta', 'velo', 'cabina', 'menu', 'panel',
  'modal', 'toast', 'tooltip', 'estado-vacio', 'indicador-simulacion',
  'indicador-fps', 'mapas', 'instantaneas',
]);
```

En `tests/repo/superficies-declaradas.test.ts`, reemplaza:

```ts
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'menu', 1],
  ['src/components/Debug/SolverMetrics.tsx', 'dev', 2],
  ['src/components/PatternEditor/ToolStrip2D.tsx', 'tira', 1],
  ['src/components/PatternEditor/FilaDeCapas.tsx', 'fila', 1],
  ['src/components/PatternEditor/renderers/HintText.tsx', 'pista', 2],
  ['src/components/shell/UnifiedBar.tsx', 'barra', 1],
  ['src/components/shell/UnifiedBar.tsx', 'velo', 1],
```

por:

```ts
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'menu', 1],
  ['src/components/Debug/SolverMetrics.tsx', 'dev', 2],
  ['src/components/PatternEditor/ToolStrip2D.tsx', 'tira', 1],
  // La fila vive en la barra superior desde P2: es parte de su ambiente. Lo
  // único suyo que aparece es el menú de «Mostrar», cuando se pliega.
  ['src/components/PatternEditor/FilaDeCapas.tsx', 'menu', 1],
  ['src/components/PatternEditor/renderers/HintText.tsx', 'pista', 2],
  ['src/components/shell/UnifiedBar.tsx', 'barra', 1],
  ['src/components/shell/UnifiedBar.tsx', 'velo', 1],
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, reemplaza:

```ts
 *  4. no escribe con --accent: sobre blanco da 3,95:1; la tinta del acento es
 *     --accent-ink.
 *
 * Fuera a propósito: la barra de IA, la tira, la fila y el dock (pasan en P2),
 * el cromo del 3D (P5) y los paneles, que son marco.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
```

por:

```ts
 *  4. no escribe con --accent: sobre blanco da 3,95:1; la tinta del acento es
 *     --accent-ink.
 *
 * Fuera a propósito: la barra de IA y la tira (pasan en P2), la fila, que
 * desde P2 vive en la barra superior y es marco (su menú plegado sí flota),
 * el cromo del 3D (P5) y los paneles, que son marco. El margen de
 * herramientas no flota, pero es papel: su raíz lleva la marca desde P2.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, reemplaza:

```ts
  ['src/components/LayerPanel/LayerPanel.tsx', 1],
  ['src/components/LayerPanel/LayerColorPicker.tsx', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 1],
  // Avisos y tooltips
  ['src/components/shell/ToastContainer.tsx', 1],
  ['src/components/shell/ToolTooltip.tsx', 1],
```

por:

```ts
  ['src/components/LayerPanel/LayerPanel.tsx', 1],
  ['src/components/LayerPanel/LayerColorPicker.tsx', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 1],
  ['src/components/PatternEditor/FilaDeCapas.tsx', 1],
  // Avisos y tooltips
  ['src/components/shell/ToastContainer.tsx', 1],
  ['src/components/shell/ToolTooltip.tsx', 1],
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, reemplaza:

```ts
  ['src/copilot/connections/ConnectionModal.tsx', 1],
  // La barrita de la pieza
  ['src/components/PatternEditor/FloatingActionBar.tsx', 1],
];

/**
```

por:

```ts
  ['src/copilot/connections/ConnectionModal.tsx', 1],
  // La barrita de la pieza
  ['src/components/PatternEditor/FloatingActionBar.tsx', 1],
  // El margen de herramientas: no flota, es la orilla de la hoja (P2)
  ['src/components/shell/Dock.tsx', 1],
];

/**
```

En `tests/repo/lo-que-flota-es-papel.test.ts`, reemplaza:

```ts
  // Menús
  ['src/styles/floating.css', ['.logo-menu', '.context-menu']],
  ['src/components/shared/SubMenu.css', '*'],
  ['src/components/shell/Dock.css', ['.dock-picker']],
  ['src/components/LayerPanel/LayerPanel.css', ['.layer-context-menu', '.layer-color-popover', '.layer-color-swatch']],
  ['src/components/Viewport3D/SurfaceModePill.css', ['.surface-pill__flyout', '.surface-pill__option']],
  // Avisos y tooltips
```

por:

```ts
  // Menús
  ['src/styles/floating.css', ['.logo-menu', '.context-menu']],
  ['src/components/shared/SubMenu.css', '*'],
  ['src/components/shell/Dock.css', ['.dock-picker', '.margen']],
  ['src/styles/layout.css', ['.grupo-del-patron__menu']],
  ['src/components/LayerPanel/LayerPanel.css', ['.layer-context-menu', '.layer-color-popover', '.layer-color-swatch']],
  ['src/components/Viewport3D/SurfaceModePill.css', ['.surface-pill__flyout', '.surface-pill__option']],
  // Avisos y tooltips
```

En `src/styles/__tests__/zIndexScale.test.ts`, reemplaza:

```ts
const SITIOS_GLOBALES: Array<{ archivo: string; patron: RegExp; nota: string }> = [
  { archivo: 'src/components/shell/Dock.css', patron: /z-index:\s*var\(--z-dock\)/, nota: 'dock' },
  { archivo: 'src/components/PatternEditor/ToolStrip2D.css', patron: /\.tool-strip\s*\{[^}]*z-index:\s*var\(--z-canvas-chrome\)/, nota: 'tira de herramienta 2D' },
  { archivo: 'src/components/PatternEditor/FilaDeCapas.css', patron: /\.fila-de-capas\s*\{[^}]*z-index:\s*var\(--z-canvas-chrome\)/, nota: 'fila de capas' },
  { archivo: 'src/styles/layout.css', patron: /\.top-bar\s*\{[^}]*z-index:\s*var\(--z-bar\)/, nota: 'top-bar' },
  { archivo: 'src/styles/unified-bar.css', patron: /z-index:\s*var\(--z-bar\)/, nota: 'unified-bar' },
  { archivo: 'src/styles/floating.css', patron: /\.logo-menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú del logo' },
  { archivo: 'src/copilot/connections/ConnectionModal.tsx', patron: /zIndex:\s*['"]var\(--z-modal\)['"]/, nota: 'ConnectionModal reclasificado a modal (tiene velo)' },
```

por:

```ts
const SITIOS_GLOBALES: Array<{ archivo: string; patron: RegExp; nota: string }> = [
  { archivo: 'src/components/shell/Dock.css', patron: /z-index:\s*var\(--z-dock\)/, nota: 'dock' },
  { archivo: 'src/components/PatternEditor/ToolStrip2D.css', patron: /\.tool-strip\s*\{[^}]*z-index:\s*var\(--z-canvas-chrome\)/, nota: 'tira de herramienta 2D' },
  { archivo: 'src/styles/layout.css', patron: /\.top-bar\s*\{[^}]*z-index:\s*var\(--z-bar\)/, nota: 'top-bar' },
  { archivo: 'src/styles/layout.css', patron: /\.grupo-del-patron__menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú de «Mostrar», el grupo del patrón plegado: cuelga de <body>' },
  { archivo: 'src/styles/unified-bar.css', patron: /z-index:\s*var\(--z-bar\)/, nota: 'unified-bar' },
  { archivo: 'src/styles/floating.css', patron: /\.logo-menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú del logo' },
  { archivo: 'src/copilot/connections/ConnectionModal.tsx', patron: /zIndex:\s*['"]var\(--z-modal\)['"]/, nota: 'ConnectionModal reclasificado a modal (tiene velo)' },
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx src/components/shell/__tests__/TopBar.test.tsx tests/repo/superficies-declaradas.test.ts tests/repo/lo-que-flota-es-papel.test.ts src/styles/__tests__/zIndexScale.test.ts`
Expected: `Tests  11 failed | 128 passed (139)`, en los cinco archivos. Fallan: cuatro de `FilaDeCapas.test.tsx` (no hay `group` «Qué se ve del patrón» ni botón «Mostrar»; los de «Largos» y «Construcción» pasan porque no buscan el grupo por su nombre), tres de `TopBar.test.tsx` (el grupo no está en la barra, y la barra tiene más de tres hijos), los dos de `superficies-declaradas` (`FilaDeCapas.tsx` no declara `menu`; `fila` sigue en el vocabulario), el de `lo-que-flota-es-papel` (`FilaDeCapas.tsx` no marca su raíz) y el de `zIndexScale` (no hay `.grupo-del-patron__menu` en `layout.css`).

- [ ] **Step 3: Implementar**

Reemplaza `src/components/PatternEditor/FilaDeCapas.tsx` entero por:

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ChevronDown } from 'lucide-react';
import type { AppDispatch, RootState } from '../../store';
import {
  toggleGrainlines,
  toggleNotches,
  toggleSeamAllowance,
  toggleSewingLines,
  toggleTrazos,
  setLineLengthMode,
} from '../../store/editorSlice';

const CAPAS = [
  { kind: 'toggle', label: 'Margen', flag: 'showSeamAllowance', action: toggleSeamAllowance },
  { kind: 'toggle', label: 'Hilo', flag: 'showGrainlines', action: toggleGrainlines },
  { kind: 'toggle', label: 'Piquetes', flag: 'showNotches', action: toggleNotches },
  { kind: 'toggle', label: 'Costuras', flag: 'showSewingLines', action: toggleSewingLines },
  // Firma de María 2026-09-12: interruptor de dos estados, no un desplegable
  // de tres. Casilla como sus hermanas, no un caso especial de verdad — solo
  // lee/escribe un campo que no es booleano (lineLengthMode).
  { kind: 'largos', label: 'Largos' },
  { kind: 'toggle', label: 'Construcción', flag: 'showTrazos', action: toggleTrazos },
] as const;

/** El nombre del grupo, plegado o no: el lector de pantalla oye lo mismo. */
const NOMBRE = 'Qué se ve del patrón';

const selectCapasVisibles = (state: RootState) => ({
  showSeamAllowance: state.editor.showSeamAllowance,
  showGrainlines: state.editor.showGrainlines,
  showNotches: state.editor.showNotches,
  showSewingLines: state.editor.showSewingLines,
  lineLengthMode: state.editor.lineLengthMode,
  showTrazos: state.editor.showTrazos,
});

/**
 * ¿Caben los seis en su hueco? Se decide midiendo (spec 2026-10-02 § 4.2), no
 * con un ancho escrito: en otro idioma los rótulos miden otra cosa. Desplegado,
 * `scrollWidth` de la fila es su ancho natural y se guarda; plegado ya no se
 * puede medir, así que se compara el hueco con el último ancho natural. Sin
 * `ResizeObserver` (jsdom) nunca se pliega.
 */
function useNoCabe(hueco: RefObject<HTMLDivElement>): boolean {
  const [noCabe, setNoCabe] = useState(false);
  const anchoNatural = useRef(0);
  useLayoutEffect(() => {
    const el = hueco.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const fila = el.querySelector<HTMLElement>('.grupo-del-patron__fila');
      if (fila) anchoNatural.current = fila.scrollWidth;
      setNoCabe(anchoNatural.current > el.clientWidth);
    };
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    medir();
    // Con la fuente de verdad cargada los rótulos cambian de ancho, y el hueco
    // no: el observador no se enteraría.
    void document.fonts?.ready.then(medir);
    return () => ro.disconnect();
  }, [hueco]);
  return noCabe;
}

/**
 * El grupo del patrón (spec 2026-10-02 «la interfaz en papel» § 4.2): los seis
 * interruptores de lo que se ve, en la barra superior, entre rehacer y el
 * selector de vista. Hasta P2 eran una fila flotante sobre el lienzo (#1109).
 *
 * Cuando no caben (otro idioma, una ventana más estrecha) se pliegan en un solo
 * botón, «Mostrar», con los seis dentro. En español a 1366 px no se pliega: lo
 * fija `barra-superior.spec.ts`.
 */
export default function FilaDeCapas() {
  const dispatch = useDispatch<AppDispatch>();
  const visibles = useSelector(selectCapasVisibles, shallowEqual);
  const hueco = useRef<HTMLDivElement>(null);
  const noCabe = useNoCabe(hueco);
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, top: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Si la ventana crece con el menú abierto, el menú se va con el botón.
  useEffect(() => { if (!noCabe) setAbierto(false); }, [noCabe]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menuRef.current?.contains(document.activeElement)) botonRef.current?.focus();
      setAbierto(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [abierto]);

  const interruptores = CAPAS.map((capa) => {
    const activo = capa.kind === 'largos' ? visibles.lineLengthMode === 'all' : visibles[capa.flag];
    const handleClick = () => {
      if (capa.kind === 'largos') dispatch(setLineLengthMode(activo ? 'none' : 'all'));
      else dispatch(capa.action());
    };
    return (
      <button
        key={capa.label}
        type="button"
        className={`grupo-del-patron__interruptor${activo ? ' grupo-del-patron__interruptor--activo' : ''}`}
        aria-pressed={activo}
        onClick={handleClick}
      >
        <span className="grupo-del-patron__marca" aria-hidden="true" />
        {capa.label}
      </button>
    );
  });

  return (
    <div ref={hueco} className="grupo-del-patron">
      {noCabe ? (
        <>
          <button
            ref={botonRef}
            type="button"
            className="grupo-del-patron__plegado"
            aria-expanded={abierto}
            aria-controls="grupo-del-patron-menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAncla({ left: r.left, top: r.bottom + 4 });
              setAbierto((a) => !a);
            }}
          >
            Mostrar
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {abierto && createPortal(
            <div
              ref={menuRef}
              id="grupo-del-patron-menu"
              className="grupo-del-patron__menu"
              role="group"
              aria-label={NOMBRE}
              data-superficie="menu"
              data-material="papel"
              style={{ left: ancla.left, top: ancla.top }}
            >
              {interruptores}
            </div>,
            document.body,
          )}
        </>
      ) : (
        <div className="grupo-del-patron__fila" role="group" aria-label={NOMBRE}>
          {interruptores}
        </div>
      )}
    </div>
  );
}
```

Borra `src/components/PatternEditor/FilaDeCapas.css` (`git rm src/components/PatternEditor/FilaDeCapas.css`).

En `src/styles/layout.css`, reemplaza:

```css
  height: var(--top-bar-h);
  background: var(--bg-deeper);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 var(--sp-3);
  gap: var(--sp-3);
  flex-shrink: 0;
  z-index: var(--z-bar);
}
.top-bar__spacer { flex: 1; }
.top-bar__status {
  display: flex;
  align-items: center;
```

por:

```css
  height: var(--top-bar-h);
  background: var(--bg-deeper);
  border-bottom: 1px solid var(--border);
  /* Tres columnas: los lados reparten a partes iguales lo que sobra y pueden
     encogerse hasta cero, así que el selector de vista queda en el centro de
     la ventana y no se mueve con lo que haya a cada lado (spec 2026-10-02
     § 4.2). Hasta P2 eran dos espaciadores `flex: 1`, y su x dependía de los
     vecinos. */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding: 0 var(--sp-3);
  column-gap: var(--sp-3);
  flex-shrink: 0;
  z-index: var(--z-bar);
}
.top-bar__lado {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}
.top-bar__lado--derecho { justify-content: flex-end; }
.top-bar__status {
  display: flex;
  align-items: center;
```

En `src/styles/layout.css`, reemplaza:

```css
  color: var(--text-muted);
}

.canvas-area {
  flex: 1;
  display: flex;
```

por:

```css
  color: var(--text-muted);
}

/* El grupo del patrón (FilaDeCapas.tsx): los seis interruptores de lo que se
   ve, sobre el marco. El estado se lee en la marca, llena o hueca, y en el
   tono del texto: no depende solo del color (ley de estado del contrato). 8 px
   entre ellos y sin relleno lateral, porque así caben a 1366 px (spec § 4.2:
   con 12 px no cabían por 7; con 2 px de relleno, medido, por 5). */
.grupo-del-patron {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.grupo-del-patron__fila { display: flex; align-items: center; gap: 8px; }
.grupo-del-patron__interruptor,
.grupo-del-patron__plegado {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-sm);
  white-space: nowrap;
  cursor: pointer;
}
.grupo-del-patron__interruptor--activo { color: var(--text-primary); }
.grupo-del-patron__marca {
  width: 8px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 2px;
}
.grupo-del-patron__interruptor--activo .grupo-del-patron__marca { background: currentColor; }
.grupo-del-patron__interruptor:hover, .grupo-del-patron__plegado:hover { color: var(--text-primary); }
.grupo-del-patron__interruptor:focus-visible, .grupo-del-patron__plegado:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; color: var(--text-primary); }

/* «Mostrar», plegado: el menú cuelga de <body> y es papel (contrato § 2,
   «todo portal nace papel»). Los mismos interruptores, en columna. */
.grupo-del-patron__menu {
  position: fixed;
  z-index: var(--z-menu);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 6px;
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
}
.grupo-del-patron__menu .grupo-del-patron__interruptor { padding: 4px 8px; }
.grupo-del-patron__menu .grupo-del-patron__interruptor:hover { background: var(--bg-elevated); }
.grupo-del-patron__menu .grupo-del-patron__interruptor:focus-visible { background: var(--bg-elevated); }

.canvas-area {
  flex: 1;
  display: flex;
```

En `src/components/shell/TopBar.tsx`, reemplaza:

```tsx
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { useState } from 'react';
import LogoMenu from './LogoMenu';
import { displayShortcut } from './shortcutDisplay';
import {
  particleCountLabel,
```

por:

```tsx
import { canUndo, canRedo } from '../../store/undoMiddleware';
import { useState } from 'react';
import LogoMenu from './LogoMenu';
import FilaDeCapas from '../PatternEditor/FilaDeCapas';
import { displayShortcut } from './shortcutDisplay';
import {
  particleCountLabel,
```

En `src/components/shell/TopBar.tsx`, reemplaza:

```tsx
  const particleCount = useSelector((s: RootState) => s.simulation.particleCount);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const [, forceUpdate] = useState(0);

  const modes: ViewMode[] = ['2d', 'split', '3d'];
  const labels: Record<ViewMode, string> = { '2d': '2D', split: 'Split', '3d': '3D' };
```

por:

```tsx
  const particleCount = useSelector((s: RootState) => s.simulation.particleCount);
  const simState = useSelector((s: RootState) => s.simulation.simulationState);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const trazos = useSelector((s: RootState) => s.project.trazos.length);
  const [, forceUpdate] = useState(0);
  // El grupo del patrón está con la hoja a la vista y algo dibujado en ella:
  // 2D o Split, con piezas o trazos (spec 2026-10-02 § 4.2).
  const conGrupoDelPatron = viewMode !== '3d' && (pieces.length > 0 || trazos > 0);

  const modes: ViewMode[] = ['2d', 'split', '3d'];
  const labels: Record<ViewMode, string> = { '2d': '2D', split: 'Split', '3d': '3D' };
```

En `src/components/shell/TopBar.tsx`, reemplaza:

```tsx

  return (
    <div className="top-bar" data-superficie="ambiente">
      {/* Logo → opens app menu */}
      <LogoMenu onOpenPanel={onOpenPanel} onImportDXF={onImportDXF} />

      {/* Undo/Redo */}
      <button
        className="icon-btn"
        onClick={handleUndo}
        disabled={!canUndo()}
        title={`Deshacer (${displayShortcut('⌘Z')})`}
        aria-label="Deshacer"
        style={{ opacity: canUndo() ? 1 : 0.3 }}
      >
        <Undo2 size={14} />
      </button>
      <button
        className="icon-btn"
        onClick={handleRedo}
        disabled={!canRedo()}
        title={`Rehacer (${displayShortcut('⌘⇧Z')})`}
        aria-label="Rehacer"
        style={{ opacity: canRedo() ? 1 : 0.3 }}
      >
        <Redo2 size={14} />
      </button>

      <div className="top-bar__spacer" />

      <div className="pill-group">
        {modes.map(m => (
```

por:

```tsx

  return (
    <div className="top-bar" data-superficie="ambiente">
      <div className="top-bar__lado">
        {/* Logo → opens app menu */}
        <LogoMenu onOpenPanel={onOpenPanel} onImportDXF={onImportDXF} />

        {/* Undo/Redo */}
        <button
          className="icon-btn"
          onClick={handleUndo}
          disabled={!canUndo()}
          title={`Deshacer (${displayShortcut('⌘Z')})`}
          aria-label="Deshacer"
          style={{ opacity: canUndo() ? 1 : 0.3 }}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={handleRedo}
          disabled={!canRedo()}
          title={`Rehacer (${displayShortcut('⌘⇧Z')})`}
          aria-label="Rehacer"
          style={{ opacity: canRedo() ? 1 : 0.3 }}
        >
          <Redo2 size={14} />
        </button>

        {conGrupoDelPatron && <FilaDeCapas />}
      </div>

      <div className="pill-group">
        {modes.map(m => (
```

En `src/components/shell/TopBar.tsx`, reemplaza:

```tsx
        ))}
      </div>

      <div className="top-bar__spacer" />

      {import.meta.env.DEV && (
        <div className="top-bar__status" aria-label="Estado técnico de la simulación" data-superficie="dev">
          <span className={dotClass} aria-hidden />
          <span>{SOLVER_TIER_INFO[solverTier].label}</span>
          {particleCount > 0 && <span>· {particleCountLabel(particleCount)}</span>}
          {pieces.length > 0 && <span>· {pieceCountLabel(pieces.length)}</span>}
        </div>
      )}
    </div>
  );
}
```

por:

```tsx
        ))}
      </div>

      <div className="top-bar__lado top-bar__lado--derecho">
        {import.meta.env.DEV && (
          <div className="top-bar__status" aria-label="Estado técnico de la simulación" data-superficie="dev">
            <span className={dotClass} aria-hidden />
            <span>{SOLVER_TIER_INFO[solverTier].label}</span>
            {particleCount > 0 && <span>· {particleCountLabel(particleCount)}</span>}
            {pieces.length > 0 && <span>· {pieceCountLabel(pieces.length)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
```

En `src/components/PatternEditor/PatternEditor.tsx`, reemplaza:

```tsx
import { resizePieceTo } from './pieceResize';
import ToolStrip2D from './ToolStrip2D';
import { suscribirNoPasoNada } from './noPasoNada';
import FilaDeCapas from './FilaDeCapas';
import type { Cota } from './cotas/cotas';
import { useFreeSewingTool } from './useFreeSewingTool';
import { getEdgeEndpoints } from '../../utils/geometry/path';
```

por:

```tsx
import { resizePieceTo } from './pieceResize';
import ToolStrip2D from './ToolStrip2D';
import { suscribirNoPasoNada } from './noPasoNada';
import type { Cota } from './cotas/cotas';
import { useFreeSewingTool } from './useFreeSewingTool';
import { getEdgeEndpoints } from '../../utils/geometry/path';
```

En `src/components/PatternEditor/PatternEditor.tsx`, reemplaza:

```tsx
           en su misma esquina: se declara inerte mientras esté abierto (#1125). */
        inerte={Boolean(notchTool.refining?.notch.notchAnchor)}
      />
      <FilaDeCapas />
      {pantallaVacia && (
        <EmptyState2D onImportDXF={onImportDXF} />
      )}
```

por:

```tsx
           en su misma esquina: se declara inerte mientras esté abierto (#1125). */
        inerte={Boolean(notchTool.refining?.notch.notchAnchor)}
      />
      {pantallaVacia && (
        <EmptyState2D onImportDXF={onImportDXF} />
      )}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx src/components/shell/__tests__/TopBar.test.tsx tests/repo/superficies-declaradas.test.ts tests/repo/lo-que-flota-es-papel.test.ts src/styles/__tests__/zIndexScale.test.ts`
Expected: `Test Files  5 passed (5)`, `Tests  139 passed (139)`.

Run: `npx tsc -b --noEmit`
Expected: sin salida.

Run: `node scripts/ui-contract-lint.mjs`
Expected: ningún contador sube; R3 535, R5 34, R8 23.

- [ ] **Step 5: Los e2e de la barra**

Crea `tests/e2e/barra-superior.spec.ts`:

```ts
import { test, expect, type Locator, type Page } from '@playwright/test';
import { abrirAppVacia, cargarDxfDeMaria, cambiarVista } from './helpers/estados';

/**
 * La barra superior (spec 2026-10-02 «la interfaz en papel» § 4.2 y § 9),
 * medida en el navegador porque jsdom no calcula layout:
 *
 *  - el selector de vista está en el centro de la ventana y no se mueve al
 *    cambiar de vista (hasta P2 vivía entre dos espaciadores `flex: 1` y su x
 *    dependía de lo que hubiera a cada lado);
 *  - en español, a 1366 px, los seis interruptores del grupo del patrón caben
 *    y no se pliegan (§ 4.2: lo fija un e2e);
 *  - cuando no caben (1280 px), se pliegan en «Mostrar» y los seis siguen a un
 *    clic, en un menú que sale de la barra y se ve entero sobre la hoja.
 */
test.describe.configure({ timeout: process.env.CI ? 240_000 : 120_000 });

interface VentanaConStore {
  __VINA_STORE__: { getState: () => { editor: { showGrainlines: boolean } } };
}

/** Los botones de `contenedor` que no se ven enteros: tapados o recortados. */
async function noSeVen(contenedor: Locator): Promise<string[]> {
  return contenedor.evaluate((c) => {
    const caja = c.getBoundingClientRect();
    return [...c.querySelectorAll('button')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const recortado = r.right > caja.right + 0.5 || r.left < caja.left - 0.5;
        return recortado || !encima || !b.contains(encima);
      })
      .map((b) => b.textContent?.trim() ?? '?');
  });
}

async function centroDelSelector(page: Page) {
  return page.evaluate(() => {
    const r = document.querySelector('.pill-group')!.getBoundingClientRect();
    return { centro: (r.left + r.right) / 2, ventana: window.innerWidth / 2 };
  });
}

test('el selector de vista está en el centro de la ventana y no se mueve entre 2D, Split y 3D', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 643 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  const centros: number[] = [];
  for (const vista of ['2D', 'Split', '3D'] as const) {
    await cambiarVista(page, vista);
    await page.waitForTimeout(300);
    const { centro, ventana } = await centroDelSelector(page);
    expect(Math.abs(centro - ventana), `en ${vista} el selector no está en el centro de la ventana`).toBeLessThanOrEqual(0.5);
    centros.push(centro);
  }
  expect(Math.max(...centros) - Math.min(...centros), 'el selector se movió al cambiar de vista').toBeLessThanOrEqual(0.5);
});

test('en español a 1366 los seis interruptores caben: el grupo no se pliega', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 643 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  await cambiarVista(page, 'Split');
  const grupo = page.getByRole('group', { name: 'Qué se ve del patrón' });
  await expect(grupo).toBeVisible();
  await expect(grupo.getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Mostrar' })).toHaveCount(0);
  expect(await noSeVen(grupo), 'interruptores tapados o recortados').toEqual([]);
});

test('a 1280 se pliega en «Mostrar», y desde ahí los seis siguen a un clic', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrirAppVacia(page);
  await cargarDxfDeMaria(page);
  const mostrar = page.getByRole('button', { name: 'Mostrar' });
  await expect(mostrar).toBeVisible();
  await mostrar.click();

  const menu = page.getByRole('group', { name: 'Qué se ve del patrón' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button')).toHaveCount(6);
  // La barra superior es contexto de apilamiento: un menú que se quedara
  // dentro de ella se cortaría en su borde. Este cuelga de <body>.
  expect(await noSeVen(menu), 'interruptores del menú tapados o recortados').toEqual([]);

  const leer = () => page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__.getState().editor.showGrainlines);
  const antes = await leer();
  await menu.getByRole('button', { name: 'Hilo' }).click();
  expect(await leer(), 'el interruptor del menú no cambió nada').toBe(!antes);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(mostrar).toBeFocused();
});
```

En `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, reemplaza:

```ts
  }, [a, b] as const);
}

test.describe('F1 — la barra de IA sigue siendo clicable con la fila de capas puesta', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('los tres botones de modo se pueden clicar en vista dividida', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await expect(page.locator('.fila-de-capas')).toBeVisible();

    const modos = await alcanzables(page, '.unified-bar__modes button');
    expect(modos.length, 'la barra de IA no expuso sus botones de modo').toBeGreaterThanOrEqual(3);
```

por:

```ts
  }, [a, b] as const);
}

/**
 * F1 se cerró de raíz en P2 de «la interfaz en papel» (spec 2026-10-02 § 4.2):
 * los interruptores dejaron el lienzo y viven en la barra superior, que la
 * barra de IA no puede tapar (`barPosition.ts` la acota por debajo). Lo que
 * sigue midiéndose es el resultado: ninguno de los dos tapa al otro.
 */
test.describe('F1 — la barra de IA y los interruptores del patrón no se pisan', () => {
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('los tres botones de modo se pueden clicar en vista dividida', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    await expect(page.locator('.grupo-del-patron')).toBeVisible();

    const modos = await alcanzables(page, '.unified-bar__modes button');
    expect(modos.length, 'la barra de IA no expuso sus botones de modo').toBeGreaterThanOrEqual(3);
```

En `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, reemplaza:

```ts
    ).toEqual([]);
  });

  test('y la fila de capas tampoco queda tapada por la barra', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    const toggles = await alcanzables(page, '.fila-de-capas button');
    expect(toggles.length).toBeGreaterThanOrEqual(4);
    const tapados = toggles.filter((t) => !t.alcanzable);
    expect(
      tapados,
      `toggles de la fila tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`,
    ).toEqual([]);
  });

  test('sus rectángulos no se solapan en absoluto', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    expect(await solape(page, '.fila-de-capas', '.unified-bar')).toBe(0);
  });

  // Viewport ANTES de abrir: la posición por defecto de la barra se calcula al
  // montarla (barPosition.ts), así que redimensionar después no la recoloca y
  // el test pasaría sin haber medido nada.
  for (const vp of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
    test(`tampoco a ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await abrirApp(page);
      await vistaDividida(page);
      expect(await solape(page, '.fila-de-capas', '.unified-bar')).toBe(0);
      const tapados = (await alcanzables(page, '.unified-bar__modes button')).filter((m) => !m.alcanzable);
      expect(tapados, `tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`).toEqual([]);
    });
```

por:

```ts
    ).toEqual([]);
  });

  test('y los interruptores tampoco quedan tapados por la barra', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    const toggles = await alcanzables(page, '.grupo-del-patron button');
    expect(toggles.length).toBeGreaterThanOrEqual(6);
    const tapados = toggles.filter((t) => !t.alcanzable);
    expect(
      tapados,
      `interruptores tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`,
    ).toEqual([]);
  });

  test('sus rectángulos no se solapan en absoluto', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
    expect(await solape(page, '.grupo-del-patron', '.unified-bar')).toBe(0);
  });

  // Viewport ANTES de abrir: la posición por defecto de la barra se calcula al
  // montarla (barPosition.ts), así que redimensionar después no la recoloca y
  // el test pasaría sin haber medido nada. A 1280 el grupo se pliega en
  // «Mostrar»: lo que se mide es ese botón.
  for (const vp of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
    test(`tampoco a ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await abrirApp(page);
      await vistaDividida(page);
      await unaPieza(page);
      expect(await solape(page, '.grupo-del-patron', '.unified-bar')).toBe(0);
      const tapados = (await alcanzables(page, '.unified-bar__modes button')).filter((m) => !m.alcanzable);
      expect(tapados, `tapados: ${tapados.map((t) => `${t.nombre} ← ${t.culpable}`).join(', ')}`).toEqual([]);
    });
```

En `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, reemplaza:

```ts
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('la fila de capas no la tapa', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
```

por:

```ts
  test.use({ viewport: MARIA });
  test.setTimeout(90_000);

  test('nada la tapa y no se sale por la derecha', async ({ page }) => {
    await abrirApp(page);
    await vistaDividida(page);
    await unaPieza(page);
```

En `tests/e2e/emplazamiento-lienzo-2d.spec.ts`, reemplaza:

```ts
      }
      if (!pista) return null;
      const rp = pista.getBoundingClientRect();
      const rf = document.querySelector('.fila-de-capas')?.getBoundingClientRect();
      const solape = rf
        ? Math.max(0, Math.min(rp.right, rf.right) - Math.max(rp.left, rf.left)) *
          Math.max(0, Math.min(rp.bottom, rf.bottom) - Math.max(rp.top, rf.top))
```

por:

```ts
      }
      if (!pista) return null;
      const rp = pista.getBoundingClientRect();
      // Desde P2 el grupo vive en la barra superior y la pista al pie de la
      // hoja: el solape tiene que seguir siendo 0.
      const rf = document.querySelector('.grupo-del-patron')?.getBoundingClientRect();
      const solape = rf
        ? Math.max(0, Math.min(rp.right, rf.right) - Math.max(rp.left, rf.left)) *
          Math.max(0, Math.min(rp.bottom, rf.bottom) - Math.max(rp.top, rf.top))
```

Y los cinco del gate que pulsan un interruptor:

En `tests/e2e/1152-los-largos-no-se-quedan-clavados.spec.ts`, reemplaza:

```ts

test.describe('#1152 — los largos no se quedan donde ya no está la pieza', () => {
  test.setTimeout(120_000);

  test('durante el arrastre no hay ninguna lectura, y al soltar vuelven en el sitio nuevo', async ({ page }) => {
    await waitForApp(page);
```

por:

```ts

test.describe('#1152 — los largos no se quedan donde ya no está la pieza', () => {
  test.setTimeout(120_000);
  // Pulsa «Largos», que desde P2 vive en la barra superior: a 1280 (el
  // viewport de estos e2e) los seis interruptores no caben y se pliegan en
  // «Mostrar» (spec 2026-10-02 § 4.2). Se mide en la pantalla de María.
  test.use({ viewport: { width: 1366, height: 768 } });

  test('durante el arrastre no hay ninguna lectura, y al soltar vuelven en el sitio nuevo', async ({ page }) => {
    await waitForApp(page);
```

En `tests/e2e/seis-firmas-maria.spec.ts`, reemplaza:

```ts
    // quiero opciones … el botón de activar el visualizador de líneas o
    // desactivar, como aparecen cuando uno va a medir, eso es TOP, pero solo
    // eso, no quiero opciones ni que estén vinculadas con la creación».
    await waitForApp(page);
    await addPiece(page, 'fria', { x: 80, y: 100 }, 200, 150);
```

por:

```ts
    // quiero opciones … el botón de activar el visualizador de líneas o
    // desactivar, como aparecen cuando uno va a medir, eso es TOP, pero solo
    // eso, no quiero opciones ni que estén vinculadas con la creación».
    // Pulsa «Largos», que desde P2 vive en la barra superior: a 1280 (el
    // viewport de estos e2e) los seis interruptores no caben y se pliegan en
    // «Mostrar» (spec 2026-10-02 § 4.2). Se mide en la pantalla de María.
    await page.setViewportSize({ width: 1366, height: 768 });
    await waitForApp(page);
    await addPiece(page, 'fria', { x: 80, y: 100 }, 200, 150);
```

En `tests/e2e/tanda4-puertas-y-defaults.spec.ts`, reemplaza:

```ts
  });

  test('fallo 4 — Largos es un interruptor apagado de fábrica, y seleccionar una pieza no lo enciende', async ({ page }) => {
    await waitForApp(page);

    // ENMENDADO el 2026-09-09 (contrato `2026-09-09-lo-que-se-ve-y-cuando`
```

por:

```ts
  });

  test('fallo 4 — Largos es un interruptor apagado de fábrica, y seleccionar una pieza no lo enciende', async ({ page }) => {
    // Pulsa «Largos», que desde P2 vive en la barra superior: a 1280 (el
    // viewport de estos e2e) los seis interruptores no caben y se pliegan en
    // «Mostrar» (spec 2026-10-02 § 4.2). Se mide en la pantalla de María.
    await page.setViewportSize({ width: 1366, height: 768 });
    await waitForApp(page);

    // ENMENDADO el 2026-09-09 (contrato `2026-09-09-lo-que-se-ve-y-cuando`
```

En `tests/e2e/trazos.spec.ts`, reemplaza:

```ts
  });

  test('«Construcción» apagada: ni se pinta, ni engancha, ni se selecciona', async ({ page }) => {
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 200 }); await clic(page, { x: 300, y: 200 }); await page.keyboard.press('Enter');
```

por:

```ts
  });

  test('«Construcción» apagada: ni se pinta, ni engancha, ni se selecciona', async ({ page }) => {
    // Pulsa «Construcción», que desde P2 vive en la barra superior: a 1280 (el
    // viewport de estos e2e) los seis interruptores no caben y se pliegan en
    // «Mostrar» (spec 2026-10-02 § 4.2). Pasaba por una carrera: hasta que
    // carga Inter los rótulos miden menos y el grupo sale desplegado un
    // instante. Se mide en la pantalla de María.
    await page.setViewportSize({ width: 1366, height: 768 });
    await waitForApp(page);
    await activarHerramienta(page, 'h', 'pen');
    await clic(page, { x: 100, y: 200 }); await clic(page, { x: 300, y: 200 }); await page.keyboard.press('Enter');
```


En `tests/e2e/lo-que-se-ve-y-cuando.spec.ts`, reemplaza:

```ts

test.describe('D1 — los largos se ven cuando se trabaja la pieza, no siempre', () => {
  test.setTimeout(120_000);

  test('proyecto recién abierto: ningún largo a la vista y el interruptor apagado', async ({ page }) => {
    await waitForApp(page);
```

por:

```ts

test.describe('D1 — los largos se ven cuando se trabaja la pieza, no siempre', () => {
  test.setTimeout(120_000);
  // Pulsa «Largos», que desde P2 vive en la barra superior: a 1280 (el
  // viewport de estos e2e) los seis interruptores no caben y se pliegan en
  // «Mostrar» (spec 2026-10-02 § 4.2). Se mide en la pantalla de María.
  test.use({ viewport: { width: 1366, height: 768 } });

  test('proyecto recién abierto: ningún largo a la vista y el interruptor apagado', async ({ page }) => {
    await waitForApp(page);
```

En `tests/e2e/lo-que-se-ve-y-cuando.spec.ts`, reemplaza:

```ts

test.describe('D3 — un lado que ya lleva chip no lleva además su lectura', () => {
  test.setTimeout(120_000);

  test('rectángulo seleccionado: ningún número repetido', async ({ page }) => {
    await waitForApp(page);
```

por:

```ts

test.describe('D3 — un lado que ya lleva chip no lleva además su lectura', () => {
  test.setTimeout(120_000);
  // Pulsa «Largos», que desde P2 vive en la barra superior: a 1280 (el
  // viewport de estos e2e) los seis interruptores no caben y se pliegan en
  // «Mostrar» (spec 2026-10-02 § 4.2). Se mide en la pantalla de María.
  test.use({ viewport: { width: 1366, height: 768 } });

  test('rectángulo seleccionado: ningún número repetido', async ({ page }) => {
    await waitForApp(page);
```

Run: `npx playwright test tests/e2e/barra-superior.spec.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts tests/e2e/1152-los-largos-no-se-quedan-clavados.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts tests/e2e/seis-firmas-maria.spec.ts tests/e2e/tanda4-puertas-y-defaults.spec.ts tests/e2e/trazos.spec.ts --retries=0 --workers=2`
Expected: `42 passed`: 3 de la barra, 8 de emplazamiento, 2 de #1152, 8 de lo que se ve, 6 de las seis firmas, 4 de tanda 4 y 11 de trazos. Sin el viewport de 1366, los ocho que pulsan «Largos» esperan el botón hasta agotar su tiempo; el de «Construcción» en `trazos` pasaba solo por una carrera (antes de que cargue Inter los rótulos miden 382 px y caben en los 384 del hueco).

Comprobar que miden de verdad, una mutación cada vez (juntas se tapan: con una columna `auto` el grupo tiene todo el ancho que pide y nunca se pliega):
1. En `src/styles/layout.css`, `grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);` → `grid-template-columns: auto auto minmax(0, 1fr);`. Run: `npx playwright test tests/e2e/barra-superior.spec.ts -g "centro" --retries=0 --workers=1`. Expected: `1 failed`, `en 2D el selector no está en el centro de la ventana`. Devuélvelo.
2. En la regla de `.grupo-del-patron__interruptor, .grupo-del-patron__plegado`, `padding: 0;` → `padding: 0 2px;`. Run: `npx playwright test tests/e2e/barra-superior.spec.ts -g "caben" --retries=0 --workers=1`. Expected: `1 failed` (el grupo se plegó: no hay `group` «Qué se ve del patrón»). Devuélvelo. Medido en el ensayo: el hueco a 1366 mide 423 px; los seis piden 404, y con 2 px de relleno, 428.

- [ ] **Step 6: Mirarlo**

A 1366 × 643 en Split: Vina, deshacer, rehacer y los seis interruptores, con el selector en el centro. A 1280 × 720: «Mostrar ▾» en su lugar, y su menú blanco con los seis. Capturas: `p2a-split.png`, `p2a-1280-plegado.png`, `p2a-1280-mostrar.png`.

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/TopBar.tsx src/components/PatternEditor/FilaDeCapas.tsx src/styles/layout.css \
  src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/__tests__/FilaDeCapas.test.tsx \
  src/components/shell/__tests__/TopBar.test.tsx tests/repo/superficies-declaradas.test.ts \
  tests/repo/lo-que-flota-es-papel.test.ts src/styles/__tests__/zIndexScale.test.ts \
  tests/e2e/barra-superior.spec.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts \
  tests/e2e/1152-los-largos-no-se-quedan-clavados.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts \
  tests/e2e/seis-firmas-maria.spec.ts tests/e2e/tanda4-puertas-y-defaults.spec.ts tests/e2e/trazos.spec.ts
git status --short   # FilaDeCapas.css ya está borrado en el índice (D) desde el Step 3
git commit -m "feat(barra): el selector de vista en el centro y los seis interruptores arriba, con «Mostrar» si no caben"
```


### Task 4: Los trinquetes, el gate y el contrato

Las dos redes nuevas entran al gate del deploy, el trinquete de contraste mide el menú de «Mostrar», las tres líneas base bajan a lo que P2a deja, y el contrato de interfaz escribe las dos reglas de emplazamiento que P2a vuelve ciertas.

**Files:**
- Test: `tests/repo/el-gate-corre-los-trinquetes.test.ts`
- Modify: `scripts/deploy-prod.sh` (la lista e2e del gate gana `margen-de-herramientas` y `barra-superior`: 34 specs)
- Modify: `tests/e2e/contraste-del-cromo.spec.ts` (estado nuevo: «menú «Mostrar» (barra plegada)», a 1280 × 720)
- Modify: `tests/e2e/reposo-baseline.json`, `tests/e2e/superficies-baseline.json`, `tests/e2e/contraste-baseline.json` (solo con `*_UPDATE=1`)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2: qué sigue oscuro; § 3: «en reposo, solo lo que perdura» y «el selector de vista y los márgenes no se mueven»)
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (§ 7.2, la nota de cuándo lleva el ámbito cada cosa)

**Interfaces:**
- Consumes: `nav.margen` (Task 2); «Mostrar» y «Qué se ve del patrón» (Task 3).
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Escribir el test del gate**

En `tests/repo/el-gate-corre-los-trinquetes.test.ts`, reemplaza:

```ts
    ]));
  });

  it('cada spec de la lista existe en disco', () => {
    expect(specsDelGate().filter((s) => !existsSync(join(RAIZ, s)))).toEqual([]);
  });
```

por:

```ts
    ]));
  });

  it('y las dos redes de emplazamiento de P2a: el margen y la barra superior (§ 9)', () => {
    expect(specsDelGate()).toEqual(expect.arrayContaining([
      'tests/e2e/margen-de-herramientas.spec.ts',
      'tests/e2e/barra-superior.spec.ts',
    ]));
  });

  it('cada spec de la lista existe en disco', () => {
    expect(specsDelGate().filter((s) => !existsSync(join(RAIZ, s)))).toEqual([]);
  });
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts`
Expected: `Tests  1 failed | 4 passed (5)`: «y las dos redes de emplazamiento de P2a: el margen y la barra superior (§ 9)».

- [ ] **Step 3: El gate y el estado de contraste**

En `scripts/deploy-prod.sh`, reemplaza:

```bash
  tests/e2e/superficies-por-accion.spec.ts \
  tests/e2e/contraste-del-cromo.spec.ts \
  tests/e2e/marca-de-escala.spec.ts \
  > /tmp/vina-deploy-e2e.log 2>&1 || {
    echo "  log completo: /tmp/vina-deploy-e2e.log" >&2
    tail -60 /tmp/vina-deploy-e2e.log >&2
```

por:

```bash
  tests/e2e/superficies-por-accion.spec.ts \
  tests/e2e/contraste-del-cromo.spec.ts \
  tests/e2e/marca-de-escala.spec.ts \
  tests/e2e/margen-de-herramientas.spec.ts \
  tests/e2e/barra-superior.spec.ts \
  > /tmp/vina-deploy-e2e.log 2>&1 || {
    echo "  log completo: /tmp/vina-deploy-e2e.log" >&2
    tail -60 /tmp/vina-deploy-e2e.log >&2
```

En `tests/e2e/contraste-del-cromo.spec.ts`, reemplaza:

```ts
  await page.waitForTimeout(200);
  await registrar('menú de superficie (3D)', page);
});
```

por:

```ts
  await page.waitForTimeout(200);
  await registrar('menú de superficie (3D)', page);
});

test('la barra superior plegada: el menú de «Mostrar»', async ({ page }) => {
  // A 1366 los seis interruptores caben; a 1280 se pliegan (spec 2026-10-02
  // § 4.2) y el menú que los lleva es papel, colgado de <body>.
  await page.setViewportSize({ width: 1280, height: 720 });
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.getByRole('button', { name: 'Mostrar' }).click();
  await expect(page.getByRole('group', { name: 'Qué se ve del patrón' })).toBeVisible();
  await page.waitForTimeout(200);
  await registrar('menú «Mostrar» (barra plegada)', page);
});
```

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts tests/repo/los-scripts-de-shell-no-llevan-cr.test.ts && bash -n scripts/deploy-prod.sh && echo sintaxis-ok`
Expected: `Tests  8 passed (8)` y `sintaxis-ok`. (Un retorno de carro antes de la barra invertida corta la lista del gate y `bash -n` lo aprueba igual: por eso corre también el test de los CR.)

- [ ] **Step 4: Las tres líneas base**

Run: `REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1`
Expected: `1 passed`, con `vacía: sobran 3 [barra, mapas, tira]`, `2D con patrón: sobran 2 [barra, tira]`, `Split con patrón: sobran 3 [barra, mapas, tira]` y `3D con patrón: sobran 2 [barra, mapas]`. La fila ya no está en ninguno: bajan vacía (4 → 3), 2D (3 → 2) y Split (4 → 3).

Run: `SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1`
Expected: `17 passed`. Bajan «reposo con patrón» (4 → 3: `[barra, pista, tira]`) y «Split en reposo» (5 → 4: `[barra, mapas, pista, tira]`); el resto queda igual.

Run: `CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1`
Expected: `13 passed`. Todos los estados quedan como estaban (el «modal de conexión» sigue en 2: son los dos textos de los ajustes de la barra de IA que P2c muda a Preferencias), y entra uno: `menú «Mostrar» (barra plegada): 0 texto(s) bajo AA`. El de «tooltip» ahora pasa el ratón por el primer botón del margen.

- [ ] **Step 5: El contrato y la spec**

En `.claude/skills/contrato-de-interfaz/SKILL.md`, reemplaza:

```markdown
  nombre que el ámbito redefine (`--text-muted: var(--text-tertiary)`), el
  ámbito lo vuelve a declarar; si no, baja con el valor del marco. Lo vigila
  `src/styles/__tests__/ambito-de-papel.test.ts`.
- **Hasta su fase siguen con el overlay oscuro de `:root`:** la barra de IA, la
  tira y la fila (P2), los paneles (P4, que los pasa a `chrome` a ras) y el
  cromo del 3D (P5). La hoja gana el ámbito en P2 y el escenario en P5.

Más una familia de **tinta**, que no es superficie: `--ink-*` es lo que se
dibuja **sobre el papel** del lienzo 2D.
```

por:

```markdown
  nombre que el ámbito redefine (`--text-muted: var(--text-tertiary)`), el
  ámbito lo vuelve a declarar; si no, baja con el valor del marco. Lo vigila
  `src/styles/__tests__/ambito-de-papel.test.ts`.
- **Hasta su fase siguen con el overlay oscuro de `:root`:** la barra de IA y
  la tira (P2), los paneles (P4, que los pasa a `chrome` a ras) y el cromo del
  3D (P5). La fila dejó el lienzo en P2: sus seis interruptores viven en la
  barra superior, que es marco, y solo su menú plegado («Mostrar») flota y es
  papel. El margen de herramientas lleva el ámbito desde P2; la hoja lo gana
  cuando se vaya la tira, y el escenario en P5.

Más una familia de **tinta**, que no es superficie: `--ink-*` es lo que se
dibuja **sobre el papel** del lienzo 2D.
```

En `.claude/skills/contrato-de-interfaz/SKILL.md`, reemplaza:

```markdown
## 3. Ley de emplazamiento

- El cromo se **acopla en canaletas**; el documento tiene área segura.
- Solo tres cosas pueden taparlo: menús transitorios, toasts y la paleta.
- Un panel nuevo NO se abre encima del patrón.
- Nada de `z-index` literal. Si necesitas una capa, es que falta un rol.
```

por:

```markdown
## 3. Ley de emplazamiento

- El cromo se **acopla en canaletas**; el documento tiene área segura.
- **En reposo, solo lo que perdura** (spec 2026-10-02 «la interfaz en papel»
  § 3, ley 2): la barra superior, los márgenes de herramientas, la línea al
  pie y la marca de escala. Nada más está montado. Lo mide
  `reposo-solo-lo-que-perdura.spec.ts`, con una línea base que solo baja.
- **El selector de vista y los márgenes no se mueven.** El selector está en el
  centro de la ventana en las tres vistas, porque la barra superior reparte
  sus dos lados a partes iguales (lo mide `barra-superior.spec.ts`). Los
  márgenes de herramientas son columnas pegadas al borde, no flotan: no tapan
  la hoja ni se desplazan con lo que pasa encima (`margen-de-herramientas.spec.ts`).
  Que tampoco se muevan al abrir un panel llega con la ranura a la derecha: en
  2D con P4, en Split con P5.
- Solo tres cosas pueden taparlo: menús transitorios, toasts y la paleta.
- Un panel nuevo NO se abre encima del patrón.
- Nada de `z-index` literal. Si necesitas una capa, es que falta un rol.
```

En `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`, reemplaza:

```markdown
dock, la tira, la fila y el cromo del 3D, que siguen oscuros, y con el ámbito su tinta se volvería
oscura sobre fondo oscuro. Los valores de lo que flota (§ 7.1) viven en el bloque del ámbito;
`:root` conserva el overlay oscuro para lo que todavía no ha pasado a papel. Así, una superficie
que olvide el atributo se queda oscura y legible, no blanca con tinta clara.

| Token | En el ámbito de papel | Sobre papel | Sobre blanco | Sobre papel hundido | Uso |
|---|---|---|---|---|---|
```

por:

```markdown
dock, la tira, la fila y el cromo del 3D, que siguen oscuros, y con el ámbito su tinta se volvería
oscura sobre fondo oscuro. Los valores de lo que flota (§ 7.1) viven en el bloque del ámbito;
`:root` conserva el overlay oscuro para lo que todavía no ha pasado a papel. Así, una superficie
que olvide el atributo se queda oscura y legible, no blanca con tinta clara. Nota del plan de P2
(2026-10-03): el margen de herramientas lleva el ámbito en su raíz desde que deja de flotar, y la
hoja lo gana cuando se vaya la tira, que es la última superficie oscura que vive encima de ella.

| Token | En el ámbito de papel | Sobre papel | Sobre blanco | Sobre papel hundido | Uso |
|---|---|---|---|---|---|
```

- [ ] **Step 6: El gate completo**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: el typecheck sin salida; `Test Files  780 passed | 3 skipped (783)` y `Tests  9345 passed | 13 skipped (9358)`; el lint limpio; y el contrato con R3 535, R5 34 y R8 23, `✓ ningún contador subió.`

- [ ] **Step 7: Commit**

```bash
git add tests/repo/el-gate-corre-los-trinquetes.test.ts scripts/deploy-prod.sh tests/e2e/contraste-del-cromo.spec.ts \
  tests/e2e/reposo-baseline.json tests/e2e/superficies-baseline.json tests/e2e/contraste-baseline.json \
  .claude/skills/contrato-de-interfaz/SKILL.md docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "test(gate): el margen y la barra superior al gate; trinquetes con la línea base de P2a; contrato § 2 y § 3"
```

- [ ] **Step 8: La lista e2e del deploy, entera**

Mergear exige la lista e2e del gate: corre entera, sin enviar nada.

Run: `bash scripts/deploy-prod.sh --ensayo`
Expected: `✓ limpio`, `✓ typecheck`, `✓ lint`, `✓ contrato de interfaz`, la suite como en el Step 6, `✓ smoke del WASM commiteado`, `✓ emplazamiento y contratos: 211 passed` sin ninguna línea `flaky`, `✓ home: 18 passed`, `✓ dist listo` y `Ensayo: no se envía nada.` Medido en el ensayo: 36,2 min de e2e. Si un caso sale rojo, se mira su error antes de tocar nada: en el ensayo, los doce rojos de la primera corrida eran de los tests, no del código (Tasks 2 y 3).


## Capturas

La carpeta `docs/reports/ui-audit-2026-10-02-hoy/` está fuera de git. Este es el script que regenera las capturas de P2a contra el servidor de este árbol en 5174, con barras de desplazamiento de verdad; se guarda en `docs/reports/ui-audit-2026-10-02-hoy/maquetas/p2a-capturas.mjs` y se corre desde la raíz del repo con `node docs/reports/ui-audit-2026-10-02-hoy/maquetas/p2a-capturas.mjs`. La página que las enseña en orden es `docs/reports/ui-audit-2026-10-02-hoy/p2a-en-la-app.html`.

```js
// Capturas de P2a (el marco del patrón) para Samuel. Contra el servidor de
// este árbol en 5174, con barras de desplazamiento de verdad.
import { chromium } from '@playwright/test';
const DXF = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';
const OUT = 'docs/reports/ui-audit-2026-10-02-hoy/capturas';
const TODAS = ['select', 'editPattern', 'point', 'pen', 'internalShape', 'rectangle', 'scissors', 'measure',
  'seam', 'seamEdit', 'seamAllowance', 'notch', 'circle', 'triangle', 'grainline', 'hand',
  'measureCurve', 'compareCurves', 'slashAndSpread', 'trimPlace', 'elastic', 'pleat'];
const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });

async function abrir(w, h, docks) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript((d) => {
    localStorage.removeItem('vina-bar-position');
    if (d) localStorage.setItem('vina-docks', JSON.stringify({ version: 2, data: { tools2d: d } }));
    else localStorage.removeItem('vina-docks');
  }, docks ?? null);
  await p.goto('http://localhost:5174/app/');
  await p.waitForSelector('svg.pattern-svg');
  await p.locator('input[accept=".dxf"]').setInputFiles(DXF);
  await p.waitForFunction(() => document.querySelectorAll('[data-piece-id]').length === 5, null, { timeout: 30000 });
  await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll('.toast__dismiss').forEach((x) => x.click()));
  await p.mouse.move(700, 400);
  await p.waitForTimeout(600);
  return p;
}
const vista = async (p, v) => { await p.locator('.pill-group').getByRole('button', { name: v, exact: true }).click(); await p.waitForTimeout(600); };

let p = await abrir(1366, 643);
await p.screenshot({ path: `${OUT}/p2a-split.png` });
await vista(p, '2D');
await p.screenshot({ path: `${OUT}/p2a-2d.png` });
await p.keyboard.press('Shift+G');
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/p2a-activa-fuera.png`, clip: { x: 0, y: 0, width: 420, height: 643 } });
await p.keyboard.press('z');
await p.locator('.logo-menu__trigger').click();
await p.getByText('Patrón', { exact: true }).hover();
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/p2a-menu-patron.png`, clip: { x: 0, y: 0, width: 720, height: 300 } });
await p.close();

p = await abrir(1280, 720);
await p.screenshot({ path: `${OUT}/p2a-1280-plegado.png`, clip: { x: 0, y: 0, width: 1280, height: 160 } });
await p.getByRole('button', { name: 'Mostrar' }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/p2a-1280-mostrar.png`, clip: { x: 0, y: 0, width: 1280, height: 300 } });
await p.close();

p = await abrir(1366, 643, TODAS);
await vista(p, '2D');
await p.screenshot({ path: `${OUT}/p2a-margen-22.png`, clip: { x: 0, y: 0, width: 420, height: 643 } });
await p.close();
await b.close();
console.log('listo');
```
