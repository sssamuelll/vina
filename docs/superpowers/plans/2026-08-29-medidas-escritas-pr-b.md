# Medidas escritas (PR B) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** el rectángulo se crea con el Ancho y el Alto escritos en la barra (un clic lo coloca), y la pluma y la línea interna aceptan el siguiente punto por largo y ángulo (Tab abre un panel que se queda abierto mientras trazas). Cierra #191, #195 y el resto de #193.

**Architecture:** `ToolOption` gana `control: 'input'` y la barra pinta un `input[type=number]`; `useRectangleTool` lee `toolOptions.rectangle` y decide clic vs. arrastre con `isDrag`; un componente `NextPointPanel` (hermano de `NotchPrecisionModal`, sin oyente en `window`) convierte largo+ángulo en un punto polar que la pluma y la línea interna colocan por `placePolar`; las teclas siguen en la captura CF-1 (spec § 8).

**Tech Stack:** React 18, Redux Toolkit, SVG, vitest + RTL (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md` (v2) — § 5, § 6, § 7, § 8 y la columna "PR B" de § 13.

## Global Constraints

- Solo Claude. TDD estricto. Gate por tarea y gate completo antes del PR (`npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`).
- Contrato de interfaz: sin color literal (R3), todo `:hover` con `:focus-visible` (R5), sin `z-index` literal (usar `--z-menu` como el panel del piquete), español del glosario. Sin `confirm/alert/prompt`.
- Convención de ángulo: 0° a la derecha, **90° hacia arriba tal como se ve en pantalla**: `dx = L·cos θ`, `dy = −L·sin θ` (y crece hacia abajo en el patrón). Un decimal en mm y en grados, sin redondeo automático.
- Rama: `feat/medidas-escritas`, creada desde `feat/lineas-internas-y-medidas` (PR A, #1088). El PR B apunta a esa rama y se retarget a `main` cuando A se mergee.

---

### Task B1 (delegable): `control: 'input'` en la barra y Ancho/Alto reales del rectángulo

**Files:**
- Modify: `src/tools/types.ts` (`ToolOption`), `src/components/shell/ToolOptionsBar2D.tsx`, `src/components/shell/ToolOptionsBar2D.css`, `src/tools/definitions/rectangle.tsx`
- Test: `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx`

**Interfaces:**
- `ToolOption` gana `control?: 'slider' | 'input'` (omisión `slider`: nada de lo que hoy se pinta cambia).
- La barra, para `type: 'number'` con `control: 'input'`, pinta `<input type="number" className="tool-options-bar__input" id={opcion-<id>} min max step value>` y despacha `setToolOption` con `Number(e.target.value)`; con el campo vacío o no numérico **no despacha** (un campo vaciado no es 0).
- `rectangle.tsx`: `width` y `height` con `control: 'input'`, `min: 1`, `max: 3000`, `step: 1`, valores por omisión 100 / 100. Las etiquetas "Ancho" / "Alto" no cambian (la instantánea de `idiomaDeOpciones.test.ts` sigue igual).

- [x] **Step 1 (rojo):** en `ToolOptionsBar2D.test.tsx`, añadir a `CON_OPCIONES.options` `{ id: 'medida', label: 'Una medida', type: 'number', value: 100, min: 1, max: 3000, step: 1, control: 'input' }` y dos `it`: (a) `screen.getByLabelText('Una medida').getAttribute('type')` es `'number'` y sigue habiendo un `range` para "Un número"; (b) `fireEvent.change(medida, { target: { value: '300' } })` deja `toolOptions.__prueba_con_opciones.medida === 300`, y `fireEvent.change(medida, { target: { value: '' } })` **no** la cambia. Correr → rojo.
- [x] **Step 2:** implementar el tipo, la rama `case 'number'` con `opcion.control === 'input'` (mismo `label htmlFor`), la clase CSS `.tool-options-bar__input` (alto 24 px, `width: 64px`, `background: var(--bg-base)`, `border: var(--surface-chrome-border)`, `border-radius: var(--radius-sm)`, `color: var(--text-primary)`, `font-size: 12px`; añadir el selector a la regla de `:focus-visible` existente **en la misma línea** que los demás — el trinquete R5 lee línea a línea) y las opciones del rectángulo.
- [x] **Step 3:** `npx vitest run src/components/shell src/tools` verde; `npx eslint <tocados> --max-warnings=0`; `node scripts/ui-contract-lint.mjs` sin subir.
- [x] **Step 4:** NO commitear (lo commitea el orquestador).

---

### Task B2: el rectángulo — clic crea con la barra, arrastre dibuja y escribe en la barra

**Files:**
- Modify: `src/components/PatternEditor/useRectangleTool.ts`, `useEditorInteractions.ts` (CF-1, pointercancel, mouseUp sin evento, `ToolHooks.rectTool`), `PatternEditor.tsx` (guard del menú contextual)
- Test: `src/components/PatternEditor/__tests__/useRectangleTool.test.tsx` (nuevo)

**Interfaces:**
- `useRectangleTool(zoom, pan, onComplete)` lee `toolOptions.rectangle.{width,height}` del store (`useSelector`) y despacha `setToolOption` al terminar un arrastre. Devuelve además `handleKeyDown(e): boolean` (Escape con press vivo → cancela, `true`), `cancel()`, `isArmed()`.
- Gramática (spec § 6): press solo con botón 0; release sin cruzar `isDrag` → pieza `width × height` de la barra con la esquina superior izquierda en el press; release con arrastre → pieza de lo dibujado (si ancho o alto es 0 no crea) y `setToolOption` de `width`/`height` redondeados a un decimal; Escape / botón derecho / `pointercancel` / blur cancelan el press.

- [x] **Step 1 (rojo):** `useRectangleTool.test.tsx` con un store real (`tools` slice) y `renderHook` dentro de `<Provider>`: (1) clic sin arrastre crea 100×100 con `outline[0] = M(press)`; (2) con `toolOptions.rectangle = {width: 300, height: 150}` el clic crea 300×150; (3) arrastre de (100,100) a (180,160) crea 80×60 y deja `toolOptions.rectangle` en `{width: 80, height: 60}`; (4) `button: 2` no arma; (5) press + Escape → `handleKeyDown` devuelve `true` y el release no crea; (6) un arrastre de 3 px cae a clic (crea con la barra, no 3×3).
- [x] **Step 2:** implementar. Borrar `MIN_SIZE`. `previewRect`/`rectDimensions` solo con arrastre real (≥ 4 px).
- [x] **Step 3:** `useEditorInteractions.ts`: en CF-1, antes de `if (e.key !== 'Escape') return;`: `if (activeTool === 'rectangle' && rectTool.isArmed()) { if (rectTool.handleKeyDown(e)) { e.preventDefault(); e.stopPropagation(); } return; }`; `handlePointerCancel`: `if (activeTool === 'rectangle') rectTool.cancel();`; `handleMouseUp`: `if (activeTool === 'rectangle') { if (e) rectTool.handleMouseUp(e); else rectTool.cancel(); }` (la firma pasa a recibir el evento). `ToolHooks.rectTool` con las tres funciones nuevas. `PatternEditor.handleContextMenu`: `if (activeTool === 'rectangle' && rectTool.isArmed()) { rectTool.cancel(); return; }`.
- [x] **Step 4:** verde + eslint + commit `feat(2d): el rectángulo se crea con el Ancho y el Alto de la barra; el arrastre los escribe`.

---

### Task B3: `NextPointPanel`

**Files:**
- Create: `src/components/PatternEditor/NextPointPanel.tsx`, `NextPointPanel.css`
- Test: `src/components/PatternEditor/__tests__/NextPointPanel.test.tsx`

**Interfaces:**
```ts
interface NextPointPanelProps {
  initialLengthMm: number;
  initialAngleDeg: number;
  /** Enter válido: coloca y el panel se queda abierto con los mismos valores. */
  onPlace: (lengthMm: number, angleDeg: number) => void;
  onClose: () => void;
}
```
- Sin oyente en `window` (spec § 7.0): `onKeyDown` en la raíz del panel — Enter válido → `onPlace` y foco de vuelta a Largo (seleccionado); Escape → `onClose`; **todo `keydown` detiene la propagación** (`e.stopPropagation()`), Tab navega nativo entre los dos campos. `autoFocus` en Largo. Estado en string; Largo válido si `> 0` y finito; Ángulo válido si finito y en `[-360, 360]`. Botón primario "Colocar punto", secundario "Cerrar". `role="dialog"`, `aria-label="Siguiente punto"`. CSS calcada de `NotchPrecisionModal.css` pero sin literales (`box-shadow: var(--surface-overlay-shadow)`, botón primario con `color: var(--on-accent)`) y con `:focus-visible` en inputs y botones.

- [x] **Step 1 (rojo):** test: (a) prefijado `80.0` / `-90.0`; (b) Enter en Largo con valores válidos → `onPlace(80, -90)`, el campo sigue con `80.0` y `document.activeElement` es Largo; (c) Escape → `onClose`; (d) Largo vacío o `0` → Enter no llama a `onPlace`; (e) un `keydown` de Backspace sobre el input **no llega** a un listener de `window` en burbuja ni a uno de `document`; (f) ningún `fill`/color literal: el `.css` no contiene `#` ni `rgba(` (leer el archivo con `fs` en el test).
- [x] **Step 2:** implementar. **Step 3:** verde + eslint + `lint:ui` sin subir + commit `feat(2d): panel "Siguiente punto" — largo y ángulo, sin oyente global`.

---

### Task B4: Tab y `placePolar` en la pluma y en la línea interna

**Files:**
- Modify: `usePenTool.ts`, `usePolyPenTool.ts`, `useEditorInteractions.ts` (doble clic de la pluma), `PatternEditor.tsx` (render del panel), `ToolHooks.pen` (`handleDoubleClick`)
- Test: `__tests__/usePenTool.test.ts` (ampliar), `__tests__/usePolyPenTool.test.tsx` (ampliar)

**Interfaces (las dos herramientas exponen lo mismo):**
```ts
nextPoint: { from: Point2D; lengthMm: number; angleDeg: number } | null;  // abierto cuando no es null
openNextPoint(): void;      // Tab: prefija con la goma (último nodo → cursor); sin nodo, no abre
closeNextPoint(): void;
placePolar(lengthMm: number, angleDeg: number): void;  // nodo nuevo desde el último: dx = L cos θ, dy = −L sin θ
```
- Pluma: `handleKeyDown` — `Tab` con ≥ 1 nodo → `openNextPoint()` y `true`; `Backspace`/`Delete` con nodos → quita el último (con 1 → limpia) y `true`. `handleDoubleClick()` — con ≥ 2 nodos completa abierta (mismo commit que Enter). `placePolar` añade un nodo esquina. `finish`/`reset` cierran el panel.
- Línea interna: `Tab` con ≥ 1 nodo → abre y `true`; `placePolar` añade un nodo del tipo latcheado (sin enganche) y **mantiene la zona muerta apagada**; `finish`/`reset` cierran el panel.
- `useEditorInteractions.handleDoubleClick`: `if (activeTool === 'pen') { pen.handleDoubleClick(); return; }`.
- `PatternEditor`: `const nextPoint = activeTool === 'pen' ? pen.nextPoint : activeTool === 'internalShape' ? internalShapeTool.nextPoint : null;` y `{nextPoint && <NextPointPanel key={activeTool} initialLengthMm={nextPoint.lengthMm} initialAngleDeg={nextPoint.angleDeg} onPlace={tool.placePolar} onClose={tool.closeNextPoint} />}` (la `key` reinicia el estado al cambiar de herramienta).

- [x] **Step 1 (rojo):** pluma: (1) Tab sin nodos → `false` y `nextPoint` null; (2) un nodo en (100,100), cursor en (150,100) (mousemove), Tab → `true`, `nextPoint = {from:(100,100), lengthMm: 50, angleDeg: 0}`; (3) `placePolar(80, 90)` → segundo nodo en (100, 20); (4) `placePolar(50, 0)` → tercero en (150, 20); (5) Backspace → dos nodos; (6) `handleDoubleClick` con 2 nodos → `onComplete` con outline abierto y `nextPoint` null; (7) Escape cierra… (Escape del trazo ya está: con panel abierto y foco fuera, Escape descarta el trazo — es el spec). Línea interna: (8) Tab con un nodo abre con prefijado de la goma; (9) `placePolar(80, -90)` → nodo en (x, y+80) del tipo latcheado; (10) `finish` por Enter cierra el panel.
- [x] **Step 2:** implementar; **Step 3:** verde + eslint + commit `feat(2d): Tab abre "Siguiente punto" en pluma y línea interna; el punto cae a largo y ángulo`.

---

### Task B5: pistas

**Files:** `HintText.tsx`, `__tests__/HintText.lineaInterna.test.tsx` (ampliar), `PatternEditor.tsx` (prop `penNodesLength` ya existe)

- [x] Pluma con trazo (`penNodesLength > 0`): `Pie` "Clic añade · arrastra para curvar · clic en el primer punto cierra · Enter o doble clic termina · Tab escribe largo y ángulo · Retroceso quita el último · Esc cancela". Línea interna con trazo: añadir " · Tab escribe largo y ángulo". Rectángulo: "Arrastra para dibujar · un clic crea con el Ancho y el Alto de la barra · Esc cancela". Tests: las tres frases nombran Tab / la barra.

---

### Task B6: e2e, changelog, PR

- [x] `tests/e2e/maria-191-rectangulo-con-medidas.spec.ts`: `s`; fijar Ancho 300 / Alto 150 escribiendo en `#opcion-width` / `#opcion-height` (`fill` + `Enter`/blur — verificar que el store recibe 300/150); clic en (400,300) → pieza de 300×150 con `outline[0] = M(400,300)`; arrastre de (100,500) a (180,560) → pieza 80×60 y la barra en 80/60.
- [x] `tests/e2e/maria-195-siguiente-punto.spec.ts`: `h`; clic en (300,400); Tab → `[role=dialog][aria-label="Siguiente punto"]` visible; escribir 80 y 90, Enter → `pen` con 2 nodos (leer el segundo nodo del outline al terminar); escribir 50 y 0, Enter; Escape → el panel se cierra y el trazo sigue; Enter (foco en el cuerpo) → pieza con 3 puntos: (300,400), (300,320), (350,320).
- [x] CHANGELOG (Added: medidas escritas; Changed: control numérico en la barra; Fixed: el clic del rectángulo y el botón derecho).
- [x] Gate completo, commit, push, PR B contra `feat/lineas-internas-y-medidas`.
