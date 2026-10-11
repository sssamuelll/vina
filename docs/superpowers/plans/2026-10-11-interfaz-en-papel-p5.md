# Interfaz en papel — P5: el 3D y el Split

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El 3D y el Split hablan el mismo idioma que el patrón: el escenario es del color de la hoja, con una línea de pelo entre las dos vistas; las herramientas del 3D van en un margen de tinta a la derecha que no se mueve; lo que se ve de la prenda sube a la barra superior; el estado de la simulación baja a la línea al pie; y la escala y la tabla de los mapas toman el material de lo que flota.

**Architecture:**
- **El marco del 3D.**
  - `RightDock` deja de flotar dentro de `.canvas-area__3d` y pasa a ser un margen (`.margen.margen--derecho`): una columna en el flujo de `.canvas-area`, detrás de los paneles, pegada al borde derecho de la ventana. Los paneles se abren entre el escenario y el margen, así que el margen no se mueve.
  - `GrupoDeLaPrenda` (Avatar, Texturizado, Mapa) entra en la barra superior en Split y 3D.
  - `SeccionDel3D` entra en la línea al pie, a la derecha de la sección del patrón: la voz de la vista y el estado de la simulación.
- **El escenario.**
  - El fondo de fábrica pasa a «Papel» (`backgroundMode: 'transparent'`, y el color de la hoja lo pone el CSS detrás del lienzo, porque `scene.background` pasa por el mapeo de tonos y un `#faf4e3` sale `#e1e0da`).
  - El suelo de fábrica es un plano que solo recibe sombra, con la opacidad de `shadowOpacity`. Se va el piso gris con su cuadrícula.
  - Las exportaciones pintan el papel debajo, salvo que `exportTransparent` esté activo.
- **Los mapas.** `FitMapToggle` se parte en `MenuDeMapas` (los cuatro mapas y sus ajustes, un menú de papel que cuelga de la barra superior) y `LeyendaDeMapas` (la escala, la tabla y el inspector, sobre el visor, en material de papel).
- **El estado.** «Avatar» sube al store: la fuente única es `renderSettings.avatarRenderStyle` (`'hidden'` = oculto), que ya usaba `AvatarModel`.

**Tech Stack:** React 18 + Redux Toolkit, three.js (WebGPURenderer) con react-three-fiber, Vitest + Testing Library (jsdom), Playwright, lucide-react 0.575. En este worktree el Vite de los e2e escucha en el 5185 (`VINA_E2E_PORT`).

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (v3):
- § 4.2 (grupo de la prenda, «Capturar visor 3D» al menú), § 4.3 (margen del 3D), § 4.5 (el escenario 3D), § 4.6 (reposo por vista);
- § 5.3 (la sección del 3D de la línea al pie), § 6.1 (el panel se abre entre el escenario y el margen), § 6.3 (lo que flota);
- § 7.5 (`--scene-3d` se retira en P5), § 8 (el piso gris), § 9 (trinquetes), § 11 (la fila P5), § 12 (las exportaciones del 3D);
- la maqueta aprobada por Samuel el 11-10 sobre la app real: `P5-en-papel.html` (capturas de Split, 3D y reposo, con los mapas), generada con `maqueta.mjs` en el scratchpad de la sesión.

## Global Constraints

- **Idioma.** Español de Venezuela con tuteo, sentence case, sin «¡» ni «por favor». Los términos salen del glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md`; los `aria-label` también van en español. Lo nuevo que lee la usuaria (la voz del 3D, «Mostrar avatar», «Papel») pasa por la skill `solace-wren`.
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/SKILL.md`):
  - tokens de `src/styles/tokens.css`, sin `var(--x, fallback)` y sin colores literales en componentes (el estado de la simulación usa `--success` y `--warning`);
  - todo portal nace papel: su raíz lleva `data-material="papel"`;
  - todo `:hover` lleva su `:focus-visible`;
  - ningún `z-index` literal;
  - Esc por la escalera (`usePeldanoDeEscape`), nunca un oyente propio;
  - una botonera que convive con el lienzo declara `data-botonera` y sus botones no toman el foco por un clic.
- **Superficies.**
  - El vocabulario de `data-superficie` gana `leyenda` (la escala, la tabla y el inspector de los mapas) y pierde `indicador-simulacion`, `indicador-fps` y `mapas`.
  - Los dos márgenes, la barra superior y la línea al pie son `ambiente`, y esa lista no crece.
  - Las líneas base de los trinquetes solo bajan, y solo se escriben con `*_UPDATE=1 … --retries=0 --workers=1`. A mano, nunca.
- **Gates:** `npx tsc -b --noEmit`, `npm run test`, `npm run lint`, `node scripts/ui-contract-lint.mjs` (si un contador baja, `--update`). Nada de `--no-verify`; `git add` con rutas explícitas. Cada tarea cierra con su suite y se commitea.
- **Hooks.** Este worktree regeneró `.husky/_` con `npx husky` (`git hook run pre-commit` lo comprueba): un worktree sin esa carpeta no corre ningún hook y no avisa.
- **Los 40 + 1 e2e del gate.** `scripts/deploy-prod.sh` lleva la lista; esta fase suma `tests/e2e/el-3d-en-papel.spec.ts`. Mergear exige el ensayo del deploy en verde sobre el árbol que se mergea.
- **La máquina es una sola.**
  - Antes de la suite entera, un e2e o el ensayo: avisarle a «Avatares feature» por mensaje y no solaparse con su ensayo.
  - Con el candado de la PR #1242 todavía fuera de `main`, las corridas pesadas de aquí se lanzan con `node D:/Desktop/projects/vina/.claude/worktrees/gate-con-memoria/scripts/pesado.mjs --nombre=<qué> -- <orden>`, que comparte el candado de la máquina entera.
  - Mirar `--estado` antes: con Blender o Ableton al 100 %, un e2e se cae por tiempo, no por fallo.
- **E2e en curso.** Mientras corre un e2e no se edita nada de la app: el Vite recarga.

## Review Focus

1. **Las exportaciones con el papel transparente.** Con «Papel» el lienzo es transparente: una captura, un still, las cuatro vistas o una vuelta 360° saldrían sin fondo, o negras en JPEG y WebM. Con `exportTransparent` activo, que sigan transparentes. → Task 2 y 3 (unitario con el contexto 2D falso; la prueba del navegador con un píxel).
2. **Espacio sobre un botón del margen del 3D.** El margen lleva «Simular», cuyo atajo es Espacio. Con el foco en «Colocar», Espacio pulsa el botón y no arranca la simulación; y un clic de ratón no deja el foco en el botón. → Task 4 (unitario).
3. **Ocultar el avatar y volver.** Ocultar con el estilo en «alambre» y volver deja «alambre», no «visible»; elegir otro estilo desde el panel suelta el guardado; el maniquí se oculta igual que el modelo. → Task 1.
4. **El estrechamiento de la línea al pie.** A 1000 px en Split el estado de la simulación sigue entero y la voz se corta con puntos suspensivos; la frase del patrón conserva sus 200 px. → Task 7 (e2e).
5. **El panel en Split.** Con Propiedades o el Avatar abiertos en Split, el margen del 3D no se mueve, el panel queda entre el escenario y el margen, y el divisor sigue repartiendo solo el ancho de las dos vistas. → Task 4 y 9 (e2e).
6. **Los atajos de los mapas.** Alt+6 a Alt+9 y Alt+0 siguen funcionando sin que el menú esté abierto; el menú muestra cuál está activo y está apagado, con su pista, hasta que haya simulación. → Task 5.

## Decisiones de este plan

1. **Rama y aislamiento.** `feat/interfaz-en-papel-p5`, desde `main` (`97e78e98`, que lleva la memoria del gate #1240), en el worktree `.claude/worktrees/p5`. `node_modules` es un enlace al del checkout principal (`package.json` no cambia). Va sin upstream hasta el push, para que nunca empuje a `main`.
2. **«Avatar»: una sola fuente, `avatarRenderStyle`.** Hoy hay dos: el `avatarHidden` local del visor (Shift+A, el botón de la barra de mapas, el menú del 3D), que oculta modelo y maniquí, y `renderSettings.avatarRenderStyle`, que solo mira `AvatarModel`. Se unen en la segunda: oculto es `'hidden'`. El interruptor guarda el estilo anterior para devolverlo. El costo: elegir «Oculto» en el panel de render ahora oculta también el maniquí.
3. **Papel por CSS, no por `data-material` en todo el escenario.** `RenderSettingsPanel` y `CollisionBodyPanel` viven dentro del visor y son marco oscuro: ponerle `data-material="papel"` a toda el área los dejaría con tinta oscura sobre fondo oscuro. El papel se pone en lo que P5 pinta encima (leyenda, tabla, inspector, menús) y el color de fondo, por `--canvas-2d`.
4. **El suelo.** `<shadowMaterial opacity={shadowOpacity} transparent />` sobre el mismo plano; se borra `FloorGrid`. `groundVisible` sigue siendo «Suelo visible». `shadowBlur` sigue sin cablear (no lo estaba antes). Si `ShadowMaterial` no pinta bajo `WebGPURenderer`, es lo primero que el navegador dice en la Task 2 y se decide ahí.
5. **Las exportaciones.** Se compone en un canvas 2D sobre el color de `--canvas-2d` leído en el momento (`getComputedStyle`; el JS no copia el hex). El EXR se queda como está: es flotante y conserva el alfa.
6. **«Capturar visor 3D».** Un puente de módulo (`visorBridge.ts`): el visor registra su captura y el menú Archivo la llama. F10 sigue donde estaba. El archivo se llama `vina-visor-3d-…png` (era `vina-fitmap-…`, de cuando la captura vivía en la barra de mapas).
7. **«Mapa» es un menú.** Cuatro elementos con los `title` de siempre (`Mapa de tensión (Alt+6)`…, para no romper los selectores) y «Ajustes del mapa…», que abre los rangos como un popover de papel. Apagado y con su pista hasta que haya simulación. Elegir uno cierra el menú.
8. **La píldora «+» de instantáneas se queda donde está, en papel.** No está en la spec; es el comparador A/B de versiones. Se mira en P6.
9. **El nombre accesible del interruptor del avatar es «Mostrar avatar».** El botón «Avatar» del margen (el que abre el panel) conserva `aria-label="Avatar"`: tres e2e lo buscan así, y dos «Avatar» harían ambiguo el selector.
10. **La voz del 3D.** Una tabla en `vozDelTresD.ts`: sin herramienta, cómo se mueve la vista (según el esquema de entrada); con una activa, su nombre, su tecla y su frase. Los nombres de `src/tools/definitions/` están en inglés y son del registro del copiloto: la tabla los traduce para la usuaria y no los toca.
11. **El pie reparte el ancho así:** la sección del patrón `flex: 1 1 0` con un mínimo; la del 3D, `flex: 0 1 auto` y sin mínimo, así que es la primera que se recorta. En 3D solo, la del patrón no existe y la del 3D ocupa todo.
12. **Se borran** `DockShell` (solo lo usaba `RightDock`), `FloorGrid`, `SimulationStatusOverlay` y `FitMapToggle` (su contenido pasa a los componentes nuevos), el texto `.sim-status` y `--scene-3d`. Los tests de cada uno migran, no se pierden.
13. **Las dos «Avatar» de P4 y P5.** El del margen abre el panel de medidas; el de la barra muestra u oculta el cuerpo. Dos verbos distintos, un nombre: es el de la spec (§ 4.2 y § 4.3).

---

### Task 1: «Avatar» al store

**Files:**
- Modify: `src/store/renderSettingsSlice.ts`
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (`avatarHidden` local, el atajo Shift+A, las props a `FitMapToggle` y a `ContextMenu3D`)
- Test: `src/store/__tests__/renderSettingsSlice.test.ts`

**Interfaces:**
- Produces: `toggleAvatarVisible()` (reducer); `selectAvatarVisible(state: { renderSettings: RenderSettingsState }): boolean`; el campo `avatarEstiloAnterior: Exclude<AvatarRenderStyle, 'hidden'> | null`.

- [ ] **Step 1: Las pruebas, en rojo.** En `renderSettingsSlice.test.ts`:

```ts
describe('el avatar a la vista (P5)', () => {
  it('ocultar y volver devuelve el estilo que había', () => {
    let s = reducer(undefined, setAvatarRenderStyle('wireframe'));
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('hidden');
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('wireframe');
  });
  it('desde «visible» oculta, y al volver queda «visible»', () => {
    let s = reducer(undefined, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('hidden');
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('visible');
  });
  it('elegir un estilo desde el panel suelta el guardado', () => {
    let s = reducer(undefined, setAvatarRenderStyle('wireframe'));
    s = reducer(s, toggleAvatarVisible());           // oculto, guarda «wireframe»
    s = reducer(s, setAvatarRenderStyle('xray'));    // lo elige la usuaria: ya se ve
    s = reducer(s, toggleAvatarVisible());           // oculta, guarda «xray»
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('xray');
  });
  it('selectAvatarVisible lee el estilo', () => {
    expect(selectAvatarVisible({ renderSettings: reducer(undefined, toggleAvatarVisible()) })).toBe(false);
    expect(selectAvatarVisible({ renderSettings: reducer(undefined, { type: '@@init' }) })).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/store/__tests__/renderSettingsSlice.test.ts`. Debe fallar porque `toggleAvatarVisible` no existe.

- [ ] **Step 3: El reducer.** En `renderSettingsSlice.ts`: el campo en `RenderSettingsState` y en `initialState` (`avatarEstiloAnterior: null`), y:

```ts
toggleAvatarVisible(state) {
  if (state.avatarRenderStyle === 'hidden') {
    state.avatarRenderStyle = state.avatarEstiloAnterior ?? 'visible';
    state.avatarEstiloAnterior = null;
  } else {
    state.avatarEstiloAnterior = state.avatarRenderStyle;
    state.avatarRenderStyle = 'hidden';
  }
},
```

y en `setAvatarRenderStyle`, además de asignar: `if (action.payload !== 'hidden') state.avatarEstiloAnterior = null;`. Exporta la acción y `export const selectAvatarVisible = (s: { renderSettings: RenderSettingsState }) => s.renderSettings.avatarRenderStyle !== 'hidden';`.

- [ ] **Step 4: El visor lo lee del store.** En `Viewport3D.tsx` borra `const [avatarHidden, setAvatarHidden] = useState(false)`; `const avatarVisible = useSelector(selectAvatarVisible)`; las dos condiciones `!avatarHidden && …` pasan a `avatarVisible && …`; el atajo Shift+A (`setAvatarHidden(h => !h)`) y el `onToggleAvatar` del `ContextMenu3D` pasan a `dispatch(toggleAvatarVisible())`; `FitMapToggle` pierde `avatarHidden`/`onToggleAvatar` en la Task 5 (aquí se le pasa `avatarHidden={!avatarVisible}` y el despacho, para que la app siga igual hasta entonces).

- [ ] **Step 5:** `npx vitest run src/store src/components/Viewport3D`, `npx tsc -b --noEmit`, y la suite entera.
- [ ] **Step 6: Commit** (`feat(3d): el avatar a la vista vive en el store`).

---

### Task 2: El escenario en papel de fábrica

**Files:**
- Modify: `src/store/renderSettingsSlice.ts` (`backgroundMode: 'transparent'` de fábrica)
- Modify: `src/components/Viewport3D/renderSections/BackgroundSection.tsx` («Transparente» → «Papel»), `ExportSection.tsx` (la nota)
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (el suelo, `FloorGrid`, el fondo del contenedor), `src/components/Viewport3D/Viewport3D.css`, `src/styles/layout.css` (`.canvas-area__3d`)
- Delete: `src/components/Viewport3D/FloorGrid.tsx`
- Modify: `src/styles/tokens.css` (se retira `--scene-3d`)
- Create: `src/utils/export/sobreElPapel.ts`
- Modify: `src/utils/export/stillExporter.ts`, `src/utils/export/turntableRenderer.ts`, `src/utils/export/animationExporter.ts`
- Test: `src/store/__tests__/renderSettingsSlice.test.ts`, `src/utils/export/__tests__/sobreElPapel.test.ts`, `src/utils/export/__tests__/stillExporter.papel.test.ts`, el de la sección de fondo

**Interfaces:**
- Produces: `colorDelPapel(): string` (lee `--canvas-2d` de `:root`; si no existe, lanza); `sobreElPapel(origen: HTMLCanvasElement): HTMLCanvasElement` (un canvas nuevo, con el papel pintado y el origen encima).

- [ ] **Step 1: Las pruebas, en rojo.**
  - `renderSettingsSlice.test.ts`: el estado inicial pasa a `backgroundMode: 'transparent'` (la aserción vieja de `'solid'` se actualiza).
  - `sobreElPapel.test.ts`: con `getComputedStyle` espiado para devolver `--canvas-2d = #faf4e3` y un `getContext('2d')` falso que registra las llamadas, `sobreElPapel` llama a `fillRect` con ese color **antes** de `drawImage`; si el token vale `''`, lanza.
  - `stillExporter.papel.test.ts`: con renderer, escena y cámara falsos (`getSize`, `getClearAlpha`, `setClearAlpha`, `setRenderTarget`, `render`, `readRenderTargetPixelsAsync`) y el 2D falso, `exportStill(…, { transparent: false })` pinta el papel antes de codificar; con `transparent: true`, no.
  - Un caso para la sección de fondo: el botón del modo `'transparent'` se llama «Papel».

- [ ] **Step 2:** correrlas; deben fallar por lo que falta, no por un error de sintaxis.

- [ ] **Step 3: El helper** (`src/utils/export/sobreElPapel.ts`):

```ts
/** El color de la hoja, leído de su token: el JS no copia el hex (contrato § 1). */
export function colorDelPapel(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--canvas-2d').trim();
  if (!v) throw new Error('sobreElPapel: --canvas-2d no está definido');
  return v;
}

/** El lienzo del visor es transparente con el fondo «Papel»: se exporta sobre el papel. */
export function sobreElPapel(origen: HTMLCanvasElement): HTMLCanvasElement {
  const salida = document.createElement('canvas');
  salida.width = origen.width;
  salida.height = origen.height;
  const ctx = salida.getContext('2d')!;
  ctx.fillStyle = colorDelPapel();
  ctx.fillRect(0, 0, salida.width, salida.height);
  ctx.drawImage(origen, 0, 0);
  return salida;
}
```

- [ ] **Step 4: Los exportadores.**
  - `stillExporter.ts`: tras `ctx.putImageData(…)`, si `!transparent`, `canvas = sobreElPapel(canvas)` antes de codificar. El camino EXR no se toca.
  - `turntableRenderer.ts` y `animationExporter.ts`: cada fotograma que se dibuja en el canvas 2D del vídeo lleva el papel debajo. En el segundo, solo con `!transparent`; en la vuelta 360° (un vídeo sin canal alfa), siempre. Léelos enteros antes de tocar: la regla es que ningún cuadro salga sin fondo.
  - `Viewport3D.tsx`: `handleCopyToClipboard` copia sobre el papel salvo `exportTransparent` (lo lee de `renderSettings`).

- [ ] **Step 5: El escenario.**
  - `renderSettingsSlice.ts`: `backgroundMode: 'transparent'`.
  - `BackgroundSection.tsx`: `['transparent', 'Papel']`; el color sólido y el HDRI siguen.
  - CSS: `.canvas-area__3d { background: var(--canvas-2d); }`; `.viewport3d` queda transparente (hoy no declara fondo).
  - `Viewport3D.tsx` (hacia la línea 961): el plano pasa a `<shadowMaterial transparent opacity={shadowOpacity} />` con `receiveShadow`, leyendo `shadowOpacity` de `renderSettings`; se quita `FloorGrid` y su import; se borra el archivo.
  - `tokens.css`: se quita `--scene-3d` y su comentario (no tiene consumidores: R2 lo vigila).

- [ ] **Step 6: La prueba del navegador, que jsdom no ve.** Con el Vite del 5185 (`VINA_E2E_PORT=5185`), un script suelto en el scratchpad (`probar-papel.mjs`, Playwright con la GPU de verdad: `--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist --enable-unsafe-webgpu`) abre `/app/` en 3D con la camisa de María vestida y mide: (a) el píxel de una esquina del escenario es `#faf4e3`; (b) hay sombra bajo el avatar (un píxel más oscuro que el papel junto a los pies); (c) una captura por `snapshot3D` (cuando exista, Task 3) y un `exportStill` tienen el papel en la esquina. **Si `ShadowMaterial` no pinta bajo WebGPURenderer, se para aquí y se decide** (alternativa: un plano con `meshBasicMaterial` transparente y un `alphaMap` de sombra falsa, o `ContactShadows`, ya descartado por incompatible).

- [ ] **Step 7:** la suite entera y `tsc`. **Commit** (`feat(3d): el escenario es papel, el suelo es solo sombra y las exportaciones pintan el papel`).

---

### Task 3: «Capturar visor 3D» en el menú Archivo

**Files:**
- Create: `src/components/Viewport3D/visorBridge.ts`
- Modify: `src/components/Viewport3D/Viewport3D.tsx` (registra `snapshot3D`; el archivo pasa a `vina-visor-3d-…png` y se compone sobre el papel)
- Modify: `src/components/shell/LogoMenu.tsx` (`FILE_MENU`, junto a «Exportar 3D / Vuelta 360°...»)
- Test: `src/components/Viewport3D/__tests__/visorBridge.test.ts`, el test del menú Vina (`src/components/shell/__tests__/LogoMenu*.test.tsx`)

**Interfaces:**
- Produces: `registrarVisor(captura: (() => void) | null): void` y `capturarVisor3D(): boolean` (falso si no hay visor registrado).

- [ ] **Step 1: En rojo.**
  - `visorBridge.test.ts`: sin visor devuelve `false` y no lanza; con uno registrado lo llama una vez y devuelve `true`; registrar `null` lo suelta.
  - El test del menú: «Archivo» tiene «Capturar visor 3D» con `shortcutId: 'tool3d.snapshot'` (se ve F10); está apagado con la vista 2D y encendido en Split y 3D; su acción llama a `capturarVisor3D`.
- [ ] **Step 2:** correrlos y ver el rojo.
- [ ] **Step 3: El puente** (módulo con una variable; lo mismo que hace el registro de pérdida de dispositivo):

```ts
let captura: (() => void) | null = null;
export const registrarVisor = (c: (() => void) | null) => { captura = c; };
export function capturarVisor3D(): boolean {
  if (!captura) return false;
  captura();
  return true;
}
```

- [ ] **Step 4:** `Viewport3D.tsx` registra `snapshot3D` en un efecto con limpieza (`registrarVisor(snapshot3D)` / `registrarVisor(null)`). `snapshot3D` compone el canvas sobre el papel salvo `exportTransparent` y descarga `vina-visor-3d-${Date.now()}.png`. El item del menú en `LogoMenu.tsx`:

```ts
{ label: 'Capturar visor 3D', shortcutId: 'tool3d.snapshot', action: () => { capturarVisor3D(); }, disabled: (s) => s.editor.viewMode === '2d' },
```

- [ ] **Step 5:** `FitMapToggle` sigue teniendo su botón de captura hasta la Task 5. La suite entera. **Commit** (`feat(3d): «Capturar visor 3D» sube al menú Archivo`).

---

### Task 4: El margen del 3D

**Files:**
- Modify: `src/components/shell/RightDock.tsx` (entero), `src/components/shell/AppShell.tsx` (`:346-364`), `src/components/shell/Dock.css`
- Delete: `src/components/shell/DockShell.tsx`, `src/components/shell/__tests__/DockShell.test.tsx`
- Test: `src/components/shell/__tests__/RightDock.test.tsx` (entero), `src/components/shell/__tests__/AppShell.canaletas.test.tsx`, `tests/repo/superficies-declaradas.test.ts`

**Interfaces:**
- Consumes: `esTeclaDeBotonera` de `src/shortcuts/teclaDeBotonera.ts` (solo como contrato: el margen declara `data-botonera`).
- Produces: el margen como `<nav className="margen margen--derecho" aria-label="Herramientas del 3D" data-superficie="ambiente" data-material="papel" data-shortcut-context="3d" data-botonera>`, hijo de `.canvas-area` y no de `.canvas-area__3d`.

- [ ] **Step 1: En rojo.** `RightDock.test.tsx` reescrito:
  - el `<nav>` se llama «Herramientas del 3D» y tiene los cuatro botones (`Colocar`, `Coser`, `Simular`, `Avatar`), con los mismos efectos que ya fijaban los tests de hoy (Coser activa `sew3d` y vuelve; Simular arranca; Colocar pone `arrange`; Avatar llama a `onOpenPanel('Avatar')`);
  - no tiene rótulo «3D» (`.dock__label`) ni el «SIMULANDO» flotante (esa prueba se muda a la Task 7);
  - con la vista 2D no se pinta;
  - declara `data-botonera` y `data-shortcut-context="3d"`;
  - un `mouseDown` sobre un botón se cancela (`fireEvent.mouseDown` devuelve `false`), para que el clic no deje el foco allí;
  - `AppShell.canaletas.test.tsx`: `<RightDock` aparece **después** de `[...paneles].reverse().map(` y fuera del bloque de `canvas-area__3d`.
  - `superficies-declaradas.test.ts`: quita `DockShell.tsx` y `RightDock.tsx / indicador-fps`; `RightDock.tsx` declara `ambiente` una vez.
- [ ] **Step 2:** correrlos y ver el rojo.
- [ ] **Step 3: El componente.** `RightDock` devuelve `null` en 2D y, si no, el `<nav>` con los mismos cuatro botones, cada uno dentro de su `ToolTooltip position="left"`. El mousedown:

```tsx
onMouseDown={(e) => { if ((e.target as Element).closest('button')) e.preventDefault(); }}
```

Se va `DockShell`, se va el rótulo y se va el bloque `{simActive && …SIMULANDO…}`. Los iconos, los `aria-label` y las acciones no cambian.
- [ ] **Step 4: El DOM.** En `AppShell.tsx`, `<RightDock>` sale de `.canvas-area__3d` y va después de los paneles, como último hijo de `.canvas-area`. `.canvas-area__3d` queda solo con el visor.
- [ ] **Step 5: El CSS.** En `Dock.css`: `.margen--derecho { border-right: 0; border-left: var(--hairline); }`; se borran las reglas `.dock`, `.dock--right`, `.dock__label` y el comentario «hasta que P5 la vuelva margen»; el comentario de `.margen` dice que es una columna en el flujo de `.canvas-area`, la del patrón dentro de `.canvas-area__2d` y la del 3D detrás de los paneles.
- [ ] **Step 6:** la suite entera y `tsc`. **Commit** (`feat(3d): las herramientas del 3D van en un margen que no se mueve`).

---

### Task 5: Los mapas: el menú y la leyenda

**Files:**
- Create: `src/components/Viewport3D/modosDeMapa.ts`, `src/components/Viewport3D/MenuDeMapas.tsx`, `src/components/Viewport3D/MenuDeMapas.css`, `src/components/Viewport3D/LeyendaDeMapas.css`
- Rename: `src/components/Viewport3D/FitMapToggle.tsx` → `LeyendaDeMapas.tsx` (se queda la escala, la tabla y el inspector), `__tests__/FitMapToggle.test.tsx` → `__tests__/LeyendaDeMapas.test.tsx`
- Modify: `src/components/Viewport3D/__tests__/acento-unico-en-el-cromo.test.ts`, `tests/repo/superficies-declaradas.test.ts`
- Test: `src/components/Viewport3D/__tests__/MenuDeMapas.test.tsx`

**Interfaces:**
- Produces:
  - `MODOS_DE_MAPA: ReadonlyArray<{ mode: FitMapMode; label: string; shortcut: string; icon: string }>` (los cuatro de hoy);
  - `ESCALA_DE_8_PARADAS` (las ocho de hoy, sin tocarlas);
  - `<MenuDeMapas />` (sin props, lee y escribe el store);
  - `<LeyendaDeMapas stats inspectedValue />`.

- [ ] **Step 1: En rojo.**
  - `MenuDeMapas.test.tsx`, dentro de `ShortcutProvider` como el test de menús de la escalera:
    - cerrado por defecto: el disparador «Mapa» y ningún elemento;
    - con la simulación en `idle`, el disparador está apagado y su `title` dice «Simula para ver los mapas de ajuste»;
    - con simulación abierta, el menú tiene los cuatro elementos con `title="Mapa de tensión (Alt+6)"`, `…estiramiento (Alt+7)`, `…ajuste (Alt+8)`, `Puntos de presión (Alt+9)` y «Ajustes del mapa…»;
    - elegir uno despacha `setFitMapMode`, cierra el menú y deja `aria-pressed` en el activo; elegirlo otra vez lo apaga;
    - Esc lo cierra por la escalera y la barra de IA, si estaba abierta, sigue;
    - el menú es un portal con `data-material="papel"` y `data-superficie="menu"`.
  - `LeyendaDeMapas.test.tsx` (lo que hoy prueba `FitMapToggle.test.tsx`, sin la barra): la escala con `stress`/`strain` en marcha, la tabla de ajuste con estadísticas, nada en `idle`; ni la escala ni la tabla escriben `#fff` ni `rgba(30,30,30` (usan tokens); declaran `data-superficie="leyenda"`.
  - `acento-unico-en-el-cromo.test.ts`: las rutas de `FitMapToggle.tsx` pasan a `LeyendaDeMapas.tsx` / `modosDeMapa.ts` (las ocho paradas siguen en el código, y ahí se les sigue sin tocar).
- [ ] **Step 2:** correrlos y ver el rojo.
- [ ] **Step 3: Los componentes.**
  - `modosDeMapa.ts`: los datos que hoy viven en `FitMapToggle.tsx` (las ocho paradas, la lista de modos).
  - `MenuDeMapas.tsx`: el disparador es un botón de texto «Mapa ▾», con la clase de «Mostrar» (`grupo-del-patron__plegado`); el menú cuelga de `<body>` por portal, anclado bajo el borde derecho del botón, con `usePeldanoDeEscape('mapas', 'menu', abierto, …)`, el patrón de `FilaDeCapas`. Los ajustes (rangos de tensión y de estiramiento, el umbral del ajuste) abren su propio popover de papel con los campos que hoy tiene `FitMapToggle` (`updateFitMapConfig`), con tokens y no colores sueltos.
  - `LeyendaDeMapas.tsx`: la escala vertical (derecha del visor), la tabla de ajuste y el inspector. El material: `data-material="papel"`; la tinta, `--text-*`; la tabla, `--surface-overlay-*`; los cuadritos de color de la tabla llevan una línea de pelo, para que el «Bien» blanco se vea sobre blanco. Los valores de la escala (los colores como DATO) no se tocan.
- [ ] **Step 4:** `LeyendaDeMapas` sustituye a `FitMapToggle` en `Viewport3D.tsx` (sin `avatarHidden`, `onToggleAvatar` ni `onSnapshot`); se borra de ahí la barra de mapas. El botón de captura y el del avatar ya tienen sus puertas nuevas (Task 3 y 6). `superficies-declaradas.test.ts`: `mapas` y `panel` de `FitMapToggle.tsx` salen; entran `leyenda` (`LeyendaDeMapas.tsx`) y `menu` (`MenuDeMapas.tsx`); el vocabulario gana `leyenda`.
- [ ] **Step 5:** la suite entera y `tsc`. **Commit** (`feat(3d): los mapas son un menú, y su escala y su tabla toman el papel`).

---

### Task 6: El grupo de la prenda

**Files:**
- Create: `src/components/shell/GrupoDeLaPrenda.tsx`, `src/components/shell/GrupoDeLaPrenda.css`
- Modify: `src/components/shell/TopBar.tsx`, `src/components/Viewport3D/SurfaceModePill.tsx`, `src/components/Viewport3D/SurfaceModePill.css`, `src/components/Viewport3D/Viewport3D.tsx`
- Test: `src/components/shell/__tests__/GrupoDeLaPrenda.test.tsx`, `src/components/shell/__tests__/TopBar*.test.tsx`, `src/components/Viewport3D/__tests__/SurfaceModePill.test.tsx`, `src/components/Viewport3D/__tests__/menus-3d-en-la-escalera.test.tsx`, `tests/repo/lo-que-flota-es-papel.test.ts`

**Interfaces:**
- Consumes: `toggleAvatarVisible` y `selectAvatarVisible` (Task 1), `<MenuDeMapas />` (Task 5), `<SurfaceModePill />`.
- Produces: `<GrupoDeLaPrenda />` con `role="group" aria-label="Qué se ve de la prenda"`: el interruptor «Avatar» (`aria-label="Mostrar avatar"`, `aria-pressed`, marca llena o hueca), «Texturizado ▾» y «Mapa ▾».

- [ ] **Step 1: En rojo.**
  - `GrupoDeLaPrenda.test.tsx`: el interruptor empieza apretado; un clic oculta (el store queda en `'hidden'`) y otro vuelve; el grupo trae «Texturizado» y «Mapa»; los tres botones comparten el estilo de los del patrón (`grupo-del-patron__interruptor` / `__plegado`).
  - El test de la barra superior: con la vista 2D no hay grupo de la prenda; en Split y 3D, sí, entre el selector y «IA»; en 3D no hay grupo del patrón.
  - `SurfaceModePill.test.tsx` y `menus-3d-en-la-escalera.test.tsx`: los nombres accesibles no cambian («Modo de superficie: …», el grupo «Modo de superficie»); el menú cuelga de `<body>` y lleva `data-material="papel"`.
  - `lo-que-flota-es-papel.test.ts`: las clases del menú del «Texturizado» y del de «Mapa».
- [ ] **Step 2:** correrlos y ver el rojo.
- [ ] **Step 3: El grupo.** Reutiliza `.grupo-del-patron__fila` y sus interruptores (`layout.css`); el contenedor es `flex: 0 0 auto`, sin `overflow: clip`, para que ni el anillo de foco ni los menús queden recortados. `GrupoDeLaPrenda.css` solo lleva lo propio (el espacio entre botones, el chevron).
- [ ] **Step 4: «Texturizado».** `SurfaceModePill` deja de ser una píldora absoluta sobre el visor: su disparador pasa al estilo de texto de «Mostrar» y el menú de nueve cuadros (3×3) se pinta por portal en `<body>`, con `data-material="papel"`, anclado bajo el disparador, a la derecha. **Se conservan** las clases `.surface-pill__trigger`, `__flyout` y `__option`, los nombres accesibles y el comportamiento: dos e2e y el trinquete de contraste los usan. Se quitan `position: absolute; top; right` y el `z-index: var(--z-panel)` del contenedor.
- [ ] **Step 5: La barra superior.** `TopBar.tsx`: `{viewMode !== '2d' && <GrupoDeLaPrenda />}` al principio del lado derecho, antes de «IA». En `Viewport3D.tsx` se quita `<SurfaceModePill />`.
- [ ] **Step 6:** la suite entera y `tsc`. **Commit** (`feat(3d): Avatar, Texturizado y Mapa suben a la barra superior`).

---

### Task 7: La sección del 3D en la línea al pie

**Files:**
- Create: `src/components/shell/SeccionDel3D.tsx`, `src/components/shell/SeccionDel3D.css`, `src/components/shell/vozDelTresD.ts`
- Modify: `src/components/shell/AppShell.tsx`, `src/styles/layout.css` (`.linea-al-pie`), `src/components/Viewport3D/Viewport3D.tsx` (se quita `<SimulationStatusOverlay />` y el bloque `.sim-status`), `src/components/Viewport3D/Viewport3D.css` (`.sim-status`), `src/styles/floating.css` (`.floating-3d`)
- Delete: `src/components/Viewport3D/SimulationStatusOverlay.tsx`
- Rename: `src/components/Viewport3D/__tests__/SimulationStatusOverlay.test.tsx` → `src/components/shell/__tests__/SeccionDel3D.test.tsx`
- Test: `src/components/shell/__tests__/vozDelTresD.test.ts`, `src/components/shell/__tests__/AppShell*.test.tsx`, `tests/repo/superficies-declaradas.test.ts`

**Interfaces:**
- Produces: `vozDelTresD(herramienta: string, opciones: { esquema: 'trackpad' | 'mouse'; poseAbierta: boolean }): { nombre: string | null; frase: string }`; `<SeccionDel3D />` (lee el store, sin props).

- [ ] **Step 1: En rojo.**
  - `vozDelTresD.test.ts`: `camera` da `nombre: null` y la frase de mover la vista según el esquema (ratón y trackpad); `arrangement` (Colocar), `sew3d` (Coser), `pin` (Fijar), `steamBrush` (Plancha a vapor), `meshGrab` (Agarre de malla) dan su nombre y una frase; con `poseAbierta` gana la de la pose; una herramienta sin entrada da un nombre genérico y una frase, no `undefined` ni inglés.
  - `SeccionDel3D.test.tsx` (con lo que probaba `SimulationStatusOverlay.test.tsx`, y el caso del «SIMULANDO» de `RightDock.test.tsx`):
    - en reposo, solo la voz;
    - corriendo, «Simulando · N fps · WebGPU» y el aviso `⚠ n` cuando lo hay;
    - **sin cifra hasta el primer cuadro**: nunca «0 fps»;
    - en pausa, «En pausa»;
    - un clic en el estado abre el detalle (fps y ms, partículas, restricciones de costura, y los avisos de hoy: sin colisión con el cuerpo, funciones limitadas del motor WASM, herramienta sin soporte, costuras sin restricciones), con `aria-label="Estado de la simulación"` y `aria-expanded`;
    - la herramienta sin soporte avisa **aunque no se simule** (C4 § 3.1.A, el aviso nunca se calla);
    - el punto de estado usa `--success`, el aviso `--warning` (sin `#`).
  - Test del shell: la sección del 3D existe con la vista Split y 3D, y no con 2D; en 3D la sección del patrón no se pinta.
  - `superficies-declaradas.test.ts`: `SimulationStatusOverlay.tsx / indicador-simulacion` sale; entran `SeccionDel3D.tsx` con `pista` (la voz) y `menu` (el detalle); el vocabulario pierde `indicador-simulacion`, `indicador-fps` y `mapas`.
- [ ] **Step 2:** correrlos y ver el rojo.
- [ ] **Step 3: La voz** (`vozDelTresD.ts`; el texto final, con `solace-wren`):
  - sin herramienta, ratón: «Clic derecho orbita · clic central o Alt + arrastrar panea»; trackpad: «Dos dedos orbitan · pellizco acerca · Alt + arrastrar panea»;
  - Colocar: «Clic en la pieza y luego en el punto del cuerpo donde va»;
  - Coser: «Clic en un borde y luego en el otro»;
  - Fijar: «Clic en la tela para fijar un punto · Ctrl+W quita todas»;
  - las demás con su nombre en español y una frase corta.

  La tecla sale del registro de atajos (`useShortcutRegistry().getBinding('tool3d.toggleArrangement' | 'tool3d.pin' | 'tool3d.steamBrush' | 'tool3d.meshGrab')`), no de una cadena escrita.
- [ ] **Step 4: La sección.** En `AppShell.tsx`, dentro de `.linea-al-pie`, después de la ranura del patrón: `{viewMode !== '2d' && <SeccionDel3D />}`; con `viewMode === '3d'`, la ranura del patrón se oculta (`hidden`). El CSS (decisión 11):

```css
.linea-al-pie__patron { flex: 1 1 0; min-width: 320px; display: flex; }
.linea-al-pie__3d { flex: 0 1 auto; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); padding: 0 var(--sp-3); border-left: var(--hairline); }
.linea-al-pie--3d-solo .linea-al-pie__3d { flex: 1 1 auto; border-left: 0; }
```

La voz es `data-superficie="pista"` y se corta con puntos suspensivos; el estado no se encoge (`flex: none`). El detalle se pinta por portal, con `data-material="papel"` y `data-superficie="menu"`, sobre la línea al pie, a la derecha, con Esc por la escalera.
- [ ] **Step 5: Lo que se va.** `SimulationStatusOverlay.tsx`, su montaje en `Viewport3D.tsx` (y el comentario que lo defiende, que ahora apunta a la sección), el bloque `.sim-status` con su emoji y sus mayúsculas, y `.floating-3d` / `--bottom-left` en `floating.css`. Se quita `import { displayShortcut }` del visor si ya nadie lo usa.
- [ ] **Step 6:** la suite entera y `tsc`. **Commit** (`feat(3d): el estado de la simulación y la voz de la vista bajan a la línea al pie`).

---

### Task 8: La línea de pelo entre las vistas y el papel del escenario

**Files:**
- Modify: `src/styles/layout.css` (`.canvas-area__divider`)
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2 «Hasta su fase…», § 3 «…en Split llega con P5»)
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (nota de P5 al pie de § 4.5 y § 6.1)
- Test: `tests/repo/el-escenario-es-papel.test.ts`

- [ ] **Step 1: En rojo.** `el-escenario-es-papel.test.ts` (contrato de código, sobre fuentes):
  - `--scene-3d` no existe en `src/` ni en `tests/`;
  - `renderSettingsSlice.ts` declara `backgroundMode: 'transparent'` de fábrica;
  - `Viewport3D.tsx` no importa `FloorGrid` ni `SimulationStatusOverlay` ni `FitMapToggle`;
  - `AppShell.tsx` pinta `RightDock` después de los paneles y no dentro de `canvas-area__3d`.
- [ ] **Step 2: El divisor.** Donde hoy hay una franja de 4 px con `--bg-base` detrás (negra), queda una línea de pelo sobre papel, y sigue siendo arrastrable (4 px de área de agarre):

```css
.canvas-area__divider { width: 4px; background: var(--canvas-2d); cursor: col-resize; flex-shrink: 0; position: relative; z-index: 5; }
.canvas-area__divider::after { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: var(--border); transition: background 0.15s ease; }
```

Hover y arrastre conservan su acento.
- [ ] **Step 3: El contrato y la spec.** En la skill: el escenario ya es papel (P5), el margen del 3D ya no se mueve en Split, y el cromo del 3D deja de ser «hasta su fase». En la spec, una nota de P5 al pie de § 6.1 (lo que decide este plan) y de § 4.5 («la voz del 3D» y «el estado» ya viven en la sección del pie).
- [ ] **Step 4:** la suite entera y `tsc`. **Commit** (`feat(3d): una línea de pelo entre las vistas, y el contrato al día`).

---

### Task 9: Los e2e, los trinquetes y el gate

**Files:**
- Create: `tests/e2e/el-3d-en-papel.spec.ts`
- Modify: `tests/e2e/fit-maps.spec.ts`, `tests/e2e/los-paneles-a-peticion.spec.ts` (`.canvas-area__3d [aria-label="Avatar"]`), `tests/e2e/contraste-del-cromo.spec.ts` (si algún paso mide algo que se movió), los e2e de `RightDock` y del Avatar fuera del gate (`bundle-split`, `ik-solver`, `morph-weights`, `seam-parity-replay`, `helpers/sim.ts`), `scripts/deploy-prod.sh` (la lista), `tests/repo/el-gate-corre-los-trinquetes.test.ts`
- Modify: `tests/e2e/reposo-baseline.json`, `superficies-baseline.json`, `contraste-baseline.json` (con `*_UPDATE=1`, nunca a mano)

- [ ] **Step 1: El e2e nuevo, en rojo** (`el-3d-en-papel.spec.ts`, a 1366 × 643, con el DXF de María, vistas Split y 3D):
  - **el escenario es papel:** el fondo de `.canvas-area__3d` es `rgb(250, 244, 227)` y `renderSettings.backgroundMode` es `transparent`;
  - **la línea de pelo:** en Split, el divisor no es una franja oscura (su fondo es el de la hoja) y su `::after` mide 1 px;
  - **el margen del 3D:** su borde derecho es el de la ventana y mide 44 px o más, con Colocar, Coser, Simular y Avatar; **no se mueve** al abrir el Avatar en Split (misma `x` con y sin panel), y el panel queda entre el escenario y el margen (`panel.right ≤ margen.left`);
  - **el grupo de la prenda:** en Split y 3D están «Mostrar avatar», «Texturizado» y «Mapa» en la barra superior; en 2D no; el interruptor oculta el avatar (el store pasa a `hidden`) y vuelve;
  - **el pie:** en Split y 3D hay una sección del 3D con la voz de la vista; en 2D no; a 1000 px de ancho el estado de la simulación sigue entero y la frase del patrón conserva 200 px o más;
  - **«Mapa»:** apagado antes de simular, y con el menú abierto (tras `startSimulation`) trae los cuatro `title` de siempre; Esc lo cierra;
  - **«Capturar visor 3D»:** el menú Archivo lo trae, apagado con la vista 2D.
- [ ] **Step 2:** correrlo contra el 5185 con `--retries=0 --workers=1` y ver el rojo.
- [ ] **Step 3: Los e2e de hoy.**
  - `fit-maps.spec.ts`: un helper `abrirMenuDeMapas(page)` (clic en «Mapa») antes de cada `button[title="Mapa …"]`, y el `click({ force: true })` por el solape con la píldora ya no hace falta;
  - `los-paneles-a-peticion.spec.ts`: el botón del Avatar se busca por `nav[aria-label="Herramientas del 3D"] [aria-label="Avatar"]`;
  - el resto, solo si fallan por lo que se movió (el criterio: arreglar el selector, no la aserción).
- [ ] **Step 4: El gate.** `el-3d-en-papel.spec.ts` entra a `SPECS_DEL_GATE` en `scripts/deploy-prod.sh`; `el-gate-corre-los-trinquetes.test.ts` espera un spec más. **Cuidado con la PR #1241 (Avatares):** también suma una línea a esa lista; el conflicto, si lo hay, es de adyacencia y se resuelve dejando las dos.
- [ ] **Step 5: Las líneas base.** Con la máquina en calma (`pesado.mjs --estado`), uno por uno:

```bash
REPOSO_UPDATE=1 npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts --retries=0 --workers=1
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --retries=0 --workers=1
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
```

Se espera: reposo `vacía`, `Split con patrón` y `3D con patrón` en 0 (hoy 1: la barra de mapas); `Split en reposo` y `simular en 3D` por debajo de hoy; el contraste, en 0. **Si una sube, se arregla el diseño, no el techo.**
- [ ] **Step 6: El ensayo del deploy** (`bash scripts/deploy-prod.sh --ensayo` con `VINA_E2E_PORT=5185`), avisado a «Avatares feature» y con el candado: unitarios, lint, trinquete de interfaz, build, home y los e2e del gate, sobre el árbol final.
- [ ] **Step 7: Commit** (`test(3d): el e2e del 3D en papel entra al gate, y los trinquetes bajan`). Lo que quede pendiente de decidir (la píldora «+», la sombra real) va en el mensaje de cierre, no en el código.

---

## Revisión final y cierre

- Dos lentes Opus en paralelo, como P3c y P4: la A ataca las premisas de este plan (cada «Decisión» y cada punto de Review Focus), la B ataca los tests con mutantes. Cada hallazgo se arregla con su prueba en rojo antes.
- La suite entera, `tsc`, lint y el trinquete de interfaz en verde sobre el commit final; el ensayo del deploy sobre ese mismo árbol.
- Capturas de verdad (no la maqueta) a 1366 × 643 en Split, 3D y reposo, comparadas con `P5-en-papel.html`.
- Nada se sube, se mergea ni se despliega sin la orden de Samuel. El orden de merge lo da la #1241 (Avatares) y luego la #1242 (el candado).
