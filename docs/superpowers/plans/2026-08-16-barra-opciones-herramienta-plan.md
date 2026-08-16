# Barra de opciones de herramienta — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reponer la barra de opciones de herramienta como canaleta acoplada en el lienzo 2D, de modo que las 52 opciones que hoy solo puede tocar el copiloto tengan puerta humana, en español.

**Architecture:** `ToolOptionsBar2D` se repone de `f4c5e92c^` y se monta como primer hijo en flujo de `.canvas-area__2d`, que pasa a `flex-direction: column`. Lee la definición de la herramienta activa desde `toolRegistry`, el atajo efectivo desde `ShortcutRegistry`, y despacha `setToolOption`. El canal es permanente: sin opciones muestra nombre y atajo, para que el patrón no salte al cambiar de herramienta.

**Tech Stack:** React 18, Redux Toolkit, Vitest + Testing Library, Playwright, CSS con tokens de `src/styles/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-08-16-barra-opciones-herramienta-design.md`

**Issue:** #1049

## Global Constraints

Cada tarea hereda esto. Vienen del contrato de interfaz (`.claude/skills/contrato-de-interfaz/SKILL.md`) y del `CLAUDE.md` del repo.

- **Español, sin mezcla de idiomas en una misma superficie.** Los términos del oficio los manda `docs/specs/2026-07-16-ui-copy-es-glosario.md`. Sentence case, sin "¡", sin title case. Los `aria-label` también en español.
- **Prohibido `var(--x, fallback)`.** Sin excepciones.
- **Ningún color literal** en componentes: ni hex, ni `rgba()`, ni en CSS ni en `style={{}}`. Todo desde `src/styles/tokens.css`.
- **Nada de `z-index` literal.** La barra es un hijo en flujo y no lleva `z-index`.
- **Material entero, no mezclado.** La barra usa `chrome`: `--surface-chrome-bg`, `--surface-chrome-border`, `--surface-chrome-radius`, `--surface-chrome-shadow`. Nunca `overlay`.
- **Todo lo que tenga `:hover` tiene `:focus-visible`.** `outline: none` solo es legal si la misma regla pone otra señal.
- **El trinquete no puede subir.** `node scripts/ui-contract-lint.mjs` corre limpio al final de cada tarea que toque estilos. Nunca editar `scripts/ui-contract-baseline.json` a mano para tapar un contador.
- **Los `value` de los `choices` no se traducen.** Son identificadores (`'curvePoints'`, `'flat-felled'`, `'outward'`). Solo cambian `label`.
- **TDD estricto:** test primero, verlo fallar por la razón correcta, implementación mínima, verlo pasar, commit.
- **Typecheck con `npx tsc -b --noEmit`**, nunca `tsc --noEmit` pelado.
- **Sin `--no-verify`.** El hook de pre-commit es el gate rápido.
- **Cualquier cambio de `position`, `overflow`, `z-index`, `isolation` o `backdrop-filter` se fija con un Playwright que mide el resultado, no el valor declarado** (enmienda del 2026-08-15). jsdom devuelve 0 en `getBoundingClientRect()`: es ciego a esto.

**Supuesto declarado:** `flat-felled` se escribe **"Rebatida"**. Es el único término del lote sin confirmar (spec §5.3). Antes de que salga una entrega a María hay que confirmarlo con ella o con Samuel.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/components/shell/ToolOptionsBar2D.tsx` | **Crear.** La barra: lee la definición activa, pinta controles, despacha. |
| `src/components/shell/ToolOptionsBar2D.css` | **Crear.** Material `chrome`, layout horizontal, scroll propio. |
| `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx` | **Crear.** Unit de la barra. |
| `src/components/shell/AppShell.tsx` | **Modificar.** Montar la barra dentro de `.canvas-area__2d`. |
| `src/styles/layout.css` | **Modificar.** `.canvas-area__2d` a columna flex. |
| `src/tools/definitions/*.tsx` (27 archivos) | **Modificar.** `name`, `label` y `choices[].label` a español. |
| `src/tools/__tests__/nombresDeHerramienta.test.ts` | **Crear.** Ata `DOCK_2D_CATALOG.label` a `ToolDefinition.name`. |
| `src/tools/__tests__/idiomaDeOpciones.test.ts` | **Crear.** Instantánea congelada de las 145 cadenas. |
| `src/store/toolSlice.ts` | **Modificar.** Borrar `optionsPanelCollapsed` y `expertShowOverride`. |
| `tests/e2e/barra-opciones-herramienta.spec.ts` | **Crear.** Los 5 casos que miden el resultado. |
| `docs/specs/2026-07-16-ui-copy-es-glosario.md` | **Modificar.** Enmienda: `hilo` (thread) vs `hilo` (grainline). |

---

## Task 1: El componente, aislado

Se crea y se prueba sin montarlo. Nadie lo ve todavía; el emplazamiento es la Task 2.

**Files:**
- Create: `src/components/shell/ToolOptionsBar2D.tsx`
- Create: `src/components/shell/ToolOptionsBar2D.css`
- Test: `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx`

**Interfaces:**
- Consumes: `toolRegistry.getTool(id)` de `src/tools` (reexportado en `index.ts:159`) · `ToolOption` de `src/tools/types.ts:45` · `setToolOption` de `src/store/toolSlice.ts:84` · `useShortcutRegistry()` de `src/shortcuts` (devuelve `ShortcutRegistry | null`) · `displayShortcutBinding(combo)` de `src/components/shell/shortcutDisplay.ts:33`
- Produces: `export default function ToolOptionsBar2D(): JSX.Element` — sin props. La Task 2 lo monta.

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx`. El montaje del store copia el patrón de los tests de `src/components/shell/__tests__/` que ya existen.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import ToolOptionsBar2D from '../ToolOptionsBar2D';

function crearStore(activeTool2D: string) {
  return configureStore({
    reducer: { tools: toolReducer },
    preloadedState: {
      tools: {
        activeTool2D,
        activeTool3D: 'camera',
        toolOptions: {},
        recentTools: [],
        // Los dos siguen en ToolState hasta la Task 6, que los borra junto con
        // estas dos líneas.
        optionsPanelCollapsed: false,
        expertShowOverride: false,
      },
    },
  });
}

function montar(activeTool2D: string) {
  const store = crearStore(activeTool2D);
  const utils = render(
    <Provider store={store}>
      <ToolOptionsBar2D />
    </Provider>,
  );
  return { store, ...utils };
}

describe('ToolOptionsBar2D', () => {
  it('pinta un control por cada opción declarada', () => {
    montar('notch');
    // notch declara shape (select), length (number), count (select)
    expect(screen.getByLabelText('Forma del piquete')).toBeInTheDocument();
    expect(screen.getByLabelText('Profundidad (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
  });

  it('despacha setToolOption al cambiar un control', () => {
    const { store } = montar('point');
    const select = screen.getByLabelText('Tipo de punto');
    fireEvent.change(select, { target: { value: 'bezier' } });
    expect(store.getState().tools.toolOptions.point.mode).toBe('bezier');
  });

  it('sin opciones sigue presente y muestra el nombre de la herramienta', () => {
    montar('select');
    // select no declara options: el canal NO desaparece
    expect(screen.getByRole('toolbar', { name: 'Opciones de la herramienta' }))
      .toBeInTheDocument();
    expect(screen.getByText('Seleccionar')).toBeInTheDocument();
  });

  it('el selector devuelve una referencia estable cuando la herramienta no tiene valores', () => {
    // react-redux avisa por consola cuando un selector devuelve un objeto
    // distinto con el mismo estado. Es lo que pasa con `?? {}` dentro del
    // selector, y es un bucle de renders, no un detalle de estilo.
    const avisos: unknown[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a) => { avisos.push(a); });

    const { store, rerender } = montar('select');
    rerender(
      <Provider store={store}>
        <ToolOptionsBar2D />
      </Provider>,
    );

    const deSelector = avisos.filter((a) =>
      String(a).includes('returned a different result when called with the same parameters'),
    );
    expect(deSelector).toEqual([]);
    spy.mockRestore();
  });
});
```

> **Ojo con el cuarto test.** El componente borrado hacía `useSelector(s => s.tools.toolOptions[id] ?? {})`. Ese `{}` es un objeto nuevo en cada render y react-redux vuelve a renderizar en bucle. La implementación usa una constante de módulo.

> El tercer test espera `'Seleccionar'`, que es el nombre en español que llega en la Task 3. **Hasta entonces este test falla**, y está bien: es el orden del plan. Si prefieres verlo verde antes, usa el nombre actual `'Select/Move'` y actualízalo en la Task 3 — pero entonces la Task 3 tiene que acordarse. Recomendado: dejarlo esperando el español y correr solo los tres primeros hasta la Task 3.

- [ ] **Paso 2: Correr el test y verlo fallar**

```bash
npx vitest run src/components/shell/__tests__/ToolOptionsBar2D.test.tsx
```

Esperado: FALLA con "Cannot find module '../ToolOptionsBar2D'".

- [ ] **Paso 3: Escribir el componente**

Crear `src/components/shell/ToolOptionsBar2D.tsx`:

```tsx
/**
 * ToolOptionsBar2D — la canaleta superior del lienzo 2D.
 *
 * Repone el componente borrado en f4c5e92c (#1049). Tres diferencias con aquel:
 * el canal es permanente (nunca `return null` — acoplado, desaparecer hace
 * saltar el patrón), muestra nombre y atajo cuando la herramienta no declara
 * opciones, y no lee `optionsPanelCollapsed` ni el modo experto, porque
 * ninguno de los dos tiene puerta en la app.
 */
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools/types';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from './shortcutDisplay';
import './ToolOptionsBar2D.css';

/** Referencia estable. Un `?? {}` dentro del selector crea un objeto por
 *  render y react-redux vuelve a renderizar en bucle. */
const SIN_VALORES: Record<string, unknown> = {};

export default function ToolOptionsBar2D() {
  const dispatch = useDispatch();
  const registroDeAtajos = useShortcutRegistry();
  const herramientaActiva = useSelector((s: RootState) => s.tools.activeTool2D);
  const valores = useSelector(
    (s: RootState) => s.tools.toolOptions[herramientaActiva] ?? SIN_VALORES,
  );

  const definicion = toolRegistry.getTool(herramientaActiva);
  const opciones = definicion?.options ?? [];

  // El atajo EFECTIVO, no el predeterminado: ShortcutRegistry guarda las
  // sobrescrituras de la usuaria en localStorage.
  const combo = registroDeAtajos?.getBinding(`tool.${herramientaActiva}`) ?? null;
  const atajo = combo ? displayShortcutBinding(combo) : null;

  const alCambiar = useCallback(
    (optionId: string, value: unknown) => {
      dispatch(setToolOption({ toolId: herramientaActiva, optionId, value }));
    },
    [dispatch, herramientaActiva],
  );

  return (
    <div
      className="tool-options-bar"
      role="toolbar"
      aria-label="Opciones de la herramienta"
    >
      <span className="tool-options-bar__tool">
        {definicion?.name ?? herramientaActiva}
      </span>
      {atajo && <kbd className="tool-options-bar__shortcut">{atajo}</kbd>}
      {opciones.length > 0 && (
        <span className="tool-options-bar__sep" aria-hidden="true" />
      )}
      {opciones.map((opcion) => (
        <Control
          key={opcion.id}
          opcion={opcion}
          valor={valores[opcion.id] ?? opcion.value}
          alCambiar={(v) => alCambiar(opcion.id, v)}
        />
      ))}
    </div>
  );
}

function Control({
  opcion,
  valor,
  alCambiar,
}: {
  opcion: ToolOption;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  const id = `opcion-${opcion.id}`;

  switch (opcion.type) {
    case 'number':
      return (
        <div className="tool-options-bar__item">
          <label className="tool-options-bar__label" htmlFor={id}>
            {opcion.label}
          </label>
          <input
            id={id}
            type="range"
            className="tool-options-bar__slider"
            min={opcion.min ?? 0}
            max={opcion.max ?? 100}
            step={opcion.step ?? 1}
            value={Number(valor)}
            onChange={(e) => alCambiar(Number(e.target.value))}
          />
          <span className="tool-options-bar__valor">{String(valor)}</span>
        </div>
      );

    case 'select':
      return (
        <div className="tool-options-bar__item">
          <label className="tool-options-bar__label" htmlFor={id}>
            {opcion.label}
          </label>
          <select
            id={id}
            className="tool-options-bar__select"
            value={String(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          >
            {opcion.choices?.map((c) => (
              <option key={String(c.value)} value={String(c.value)}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'toggle':
      // Sin texto ON/OFF: el estado va en el relleno y en aria-pressed. Por
      // ley de estado no puede depender solo del tono.
      return (
        <div className="tool-options-bar__item">
          <button
            id={id}
            type="button"
            className={`tool-options-bar__toggle${valor ? ' tool-options-bar__toggle--activo' : ''}`}
            aria-pressed={Boolean(valor)}
            onClick={() => alCambiar(!valor)}
          >
            <span className="tool-options-bar__marca" aria-hidden="true" />
            {opcion.label}
          </button>
        </div>
      );

    case 'color':
      return (
        <div className="tool-options-bar__item">
          <label className="tool-options-bar__label" htmlFor={id}>
            {opcion.label}
          </label>
          <input
            id={id}
            type="color"
            className="tool-options-bar__color"
            value={String(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          />
        </div>
      );

    default:
      return null;
  }
}
```

- [ ] **Paso 4: Escribir la hoja de estilo**

Crear `src/components/shell/ToolOptionsBar2D.css`. **Todos los valores salen de tokens**; si falta un token, se define en `src/styles/tokens.css`, nunca aquí.

```css
/* Canaleta superior del lienzo 2D. Material `chrome`: va acoplada, así que es
   opaca. Nada de `overlay` — su backdrop-filter la volvería bloque contenedor
   de cualquier descendiente `position: fixed`. */
.tool-options-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  /* Desborda dentro de sí misma; nunca empuja el layout. */
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--surface-chrome-bg);
  border-bottom: var(--surface-chrome-border);
  color: var(--text-primary);
}

.tool-options-bar__tool {
  font-weight: 600;
  white-space: nowrap;
}

.tool-options-bar__shortcut {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.tool-options-bar__sep {
  width: 1px;
  align-self: stretch;
  background: var(--border-subtle);
}

.tool-options-bar__item {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  white-space: nowrap;
}

.tool-options-bar__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.tool-options-bar__toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-2);
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: var(--surface-chrome-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

/* El activo cambia RELLENO, no solo tono: un control de 16px que solo cambia
   de color no comunica nada y falla para quien no distingue colores. */
.tool-options-bar__toggle--activo {
  color: var(--text-primary);
  background: var(--accent-subtle);
  border-color: var(--accent-border);
}

.tool-options-bar__marca {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  border: 1px solid currentColor;
}

.tool-options-bar__toggle--activo .tool-options-bar__marca {
  background: currentColor;
}

.tool-options-bar__toggle:hover {
  color: var(--text-primary);
}

/* Toda regla :hover trae su :focus-visible — si no, el trinquete R5 sube y el
   gate falla solo. */
.tool-options-bar__toggle:focus-visible,
.tool-options-bar__select:focus-visible,
.tool-options-bar__slider:focus-visible,
.tool-options-bar__color:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

> **Antes de escribirla, comprobar qué tokens existen** (`--sp-1`, `--sp-2`, `--sp-3`, `--radius-sm`, `--border-subtle`, `--accent`, `--accent-soft`, `--text-secondary`, `--font-mono`). Los que falten se **definen en `src/styles/tokens.css`**. Un `var(--x, fallback)` está prohibido y un token fantasma lo caza la regla R2 del trinquete.

- [ ] **Paso 5: Correr los tests y verlos pasar**

```bash
npx vitest run src/components/shell/__tests__/ToolOptionsBar2D.test.tsx
```

Esperado: los tres primeros PASAN. El tercero (`'Seleccionar'`) queda rojo hasta la Task 3 — se declara en el reporte, no se tapa.

- [ ] **Paso 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run lint && node scripts/ui-contract-lint.mjs
git add src/components/shell/ToolOptionsBar2D.tsx \
        src/components/shell/ToolOptionsBar2D.css \
        src/components/shell/__tests__/ToolOptionsBar2D.test.tsx
git commit -m "feat(opciones): reponer ToolOptionsBar2D — el componente, sin montar"
```

---

## Task 2: Emplazamiento — la canaleta reserva alto de verdad

Aquí vive el riesgo del cambio. Todo lo mide Playwright, no la vista.

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/styles/layout.css:36-40`
- Test: `tests/e2e/barra-opciones-herramienta.spec.ts` (crear)

**Interfaces:**
- Consumes: `ToolOptionsBar2D` de la Task 1.
- Produces: `.canvas-area__2d` pasa a `display: flex; flex-direction: column`. Cualquier tarea futura que meta un hijo ahí hereda ese modelo.

- [ ] **Paso 1: Escribir los tres casos e2e que fallan**

Crear `tests/e2e/barra-opciones-herramienta.spec.ts`. El arranque es el mismo de `tests/e2e/emplazamiento-paneles.spec.ts`, que ya existe y está verde: navega a `/` y espera `svg.pattern-svg`.

```ts
import { test, expect, Page } from '@playwright/test';

/**
 * #1049: la barra de opciones de herramienta pasa a ser canaleta acoplada
 * dentro de `.canvas-area__2d`, que cambia a columna flex.
 *
 * Por qué es un e2e y no vitest: jsdom no calcula layout —
 * `getBoundingClientRect()` da 0 siempre—, así que ningún unitario puede ver
 * si el lienzo encoge, si salta al cambiar de herramienta, ni si desborda por
 * debajo de la barra. La restricción global lo exige para todo cambio de
 * `position` u `overflow`: medir el RESULTADO, no el valor declarado.
 */

async function abrirApp(page: Page) {
  await page.goto('/');
  await page.waitForSelector('svg.pattern-svg', { timeout: 20000 });
  await page.waitForTimeout(500);
}

test.describe('barra de opciones de herramienta', () => {
  test.beforeEach(async ({ page }) => {
    await abrirApp(page);
  });

  test('el alto del lienzo no cambia al alternar herramientas', async ({ page }) => {
    // Punto declara opciones; Seleccionar no. El canal es permanente, así que
    // el lienzo tiene que medir lo mismo con las dos.
    await page.getByRole('button', { name: 'Punto' }).click();
    const conOpciones = await page.locator('svg.pattern-svg').boundingBox();

    await page.getByRole('button', { name: 'Seleccionar' }).click();
    const sinOpciones = await page.locator('svg.pattern-svg').boundingBox();

    expect(sinOpciones!.height).toBeCloseTo(conOpciones!.height, 0);
    expect(sinOpciones!.y).toBeCloseTo(conOpciones!.y, 0);
  });

  test('el lienzo no desborda por debajo de la barra', async ({ page }) => {
    const area = await page.locator('.canvas-area__2d').boundingBox();
    const barra = await page.locator('.tool-options-bar').boundingBox();
    const lienzo = await page.locator('.pattern-editor').boundingBox();

    // El lienzo arranca donde termina la barra y cabe dentro del área.
    expect(lienzo!.y).toBeGreaterThanOrEqual(barra!.y + barra!.height - 1);
    expect(lienzo!.y + lienzo!.height).toBeLessThanOrEqual(area!.y + area!.height + 1);
  });

  test('la barra es cromo en flujo, no una capa', async ({ page }) => {
    const estilo = await page.locator('.tool-options-bar').evaluate((el) => {
      const c = getComputedStyle(el);
      return { position: c.position, zIndex: c.zIndex };
    });
    expect(estilo.position).toBe('static');
    expect(estilo.zIndex).toBe('auto');
  });
});
```

- [ ] **Paso 2: Correr y verlos fallar**

```bash
npx playwright test barra-opciones-herramienta.spec.ts --workers=2 --retries=0
```

Esperado: los tres FALLAN — `.tool-options-bar` no existe en el DOM.

> **Servidor caliente y pocos workers.** Vite en frío con muchos workers da timeouts falsos. Levantar `npm run dev` antes y usar `--workers=2`.

- [ ] **Paso 3: Montar la barra en AppShell**

En `src/components/shell/AppShell.tsx`, dentro del `<div className="canvas-area__2d">`, la barra va **primero**, antes de `LeftDock` y `PatternEditor`:

```tsx
<div
  className="canvas-area__2d"
  style={{ flex: `${get2dFlexGrow()} 1 0px`, display: viewMode === '3d' ? 'none' : undefined }}
>
  <ToolOptionsBar2D />
  <LeftDock onOpenPanel={togglePanel} />
  <PatternEditor
    onImportDXF={() => dxfInputRef.current?.click()}
    onOpenPanel={openPanel}
  />
</div>
```

Con su import:

```tsx
import ToolOptionsBar2D from './ToolOptionsBar2D';
```

> `LeftDock` no se toca. Es `position: absolute; top: 50%; transform: translateY(-50%)` (`Dock.css:3-19`), o sea fuera de flujo: el flex de columna no lo mueve. Queda centrado sobre la columna entera en vez de sobre el documento, ~18px más abajo. Se deja así a propósito (spec §2).

> El `style` en línea que ya tiene ese `div` **se conserva tal cual**. `display: 'none'` en modo 3D gana sobre el `display: flex` de la hoja, que es lo que hace falta.

- [ ] **Paso 4: Poner `.canvas-area__2d` en columna**

En `src/styles/layout.css`, la regla de la línea 36:

```css
.canvas-area__2d {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f5f3f0; /* Warm paper — 2D canvas needs a light bg for pattern visibility */
}

/* .pattern-editor es width/height 100%. En columna flex, un alto en porcentaje
   se resuelve contra el contenedor IGNORANDO que un hermano ya se llevó
   espacio, así que desbordaría por debajo de la barra. flex-basis: 0 gana
   sobre height para el tamaño base y flex-grow reparte lo que queda. */
.canvas-area__2d > .pattern-editor {
  flex: 1 1 0;
  min-height: 0;
}
```

> El `background` literal **no se toca**: es preexistente y es de la regla R3, que tiene 966 sitios. Arreglar uno al azar no es el trabajo de esta tanda.

- [ ] **Paso 5: Correr los e2e y verlos pasar**

```bash
npx playwright test barra-opciones-herramienta.spec.ts --workers=2 --retries=0
```

Esperado: 3 de 3 PASAN.

Si el segundo caso falla, el `flex: 1 1 0` no está ganando: comprobar que `.pattern-editor` es hijo **directo** de `.canvas-area__2d` y no viene envuelto por `PatternEditor`.

- [ ] **Paso 6: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && node scripts/ui-contract-lint.mjs
git add src/components/shell/AppShell.tsx src/styles/layout.css \
        tests/e2e/barra-opciones-herramienta.spec.ts
git commit -m "feat(opciones): acoplar la barra en la canaleta superior del lienzo 2D"
```

---

## Task 3: Un nombre por herramienta

27 nombres al español, y un test que impide que el dock y la definición vuelvan a divergir.

**Files:**
- Modify: 27 archivos de `src/tools/definitions/`
- Test: `src/tools/__tests__/nombresDeHerramienta.test.ts` (crear)

**Interfaces:**
- Consumes: `DOCK_2D_CATALOG` de `src/components/shell/dock2dTools.ts:22`
- Produces: `ToolDefinition.name` en español para las 27. La Task 1 lo pinta; las Tasks 4-5 traducen las opciones del mismo archivo.

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/tools/__tests__/nombresDeHerramienta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../index';
import { DOCK_2D_CATALOG } from '../../components/shell/dock2dTools';

/** seamEdit está en el catálogo del dock y NO tiene definición: su handler
 *  vive en useSeamEditTool. Es la única excepción legítima. */
const SIN_DEFINICION = new Set(['seamEdit']);

describe('nombres de herramienta', () => {
  it('el dock y la definición dicen lo mismo', () => {
    for (const entrada of DOCK_2D_CATALOG) {
      if (SIN_DEFINICION.has(entrada.id)) continue;
      const definicion = toolRegistry.getTool(entrada.id);
      expect(definicion, `${entrada.id} no tiene definición`).toBeDefined();
      expect(definicion!.name, `${entrada.id}: el dock dice "${entrada.label}"`)
        .toBe(entrada.label);
    }
  });

  it('seamEdit sigue siendo la única excepción', () => {
    const huerfanas = DOCK_2D_CATALOG
      .filter((e) => !toolRegistry.getTool(e.id))
      .map((e) => e.id);
    expect(huerfanas).toEqual(['seamEdit']);
  });
});
```

- [ ] **Paso 2: Correr y verlo fallar**

```bash
npx vitest run src/tools/__tests__/nombresDeHerramienta.test.ts
```

Esperado: FALLA en `select` — el dock dice `Seleccionar`, la definición dice `Select/Move`.

- [ ] **Paso 3: Traducir los 27 nombres**

En cada archivo de `src/tools/definitions/`, cambiar solo el campo `name`:

| Archivo | `name` hoy | `name` nuevo |
|---|---|---|
| `select.tsx` | `Select/Move` | `Seleccionar` |
| `editPattern.tsx` | `Edit Pattern` | `Editar patrón` |
| `point.tsx` | `Punto` | *(sin cambio)* |
| `pen.tsx` | `Pen Tool` | `Pluma` |
| `line.tsx` | `Line Tool` | `Línea` |
| `rectangle.tsx` | `Rectangle Tool` | `Rectángulo` |
| `scissors.tsx` | `Scissors (Split)` | `Tijeras` |
| `measure.tsx` | `Measure` | `Medir` |
| `seam.tsx` | `Seam` | `Coser` |
| `seamAllowance.tsx` | `Seam Allowance` | `Margen de costura` |
| `notch.tsx` | `Notch` | `Piquete` |
| `internalShape.tsx` | `Internal Shape` | `Forma interna` |
| `grainline.tsx` | `Grainline` | `Hilo` |
| `transform.tsx` | `Transform` | `Transformar patrón` |
| `circle.tsx` | `Circle/Curve Tool` | `Elipse (círculo)` |
| `trace.tsx` | `Trace` | `Trazar` |
| `dart.tsx` | `Dart` | `Pinza` |
| `pin.tsx` | `Pin` | `Fijar` |
| `walkSeam.tsx` | `Walk Seam` | `Recorrer costura` |
| `polyPen.tsx` | `Poly Pen` | `Pluma poligonal` |
| `pomMeasure.tsx` | `POM Measure` | `Medir POM` |
| `offsetOutline.tsx` | `Offset Outline` | `Desplazar contorno` |
| `extendTrim.tsx` | `Extend / Trim` | `Extender / recortar` |
| `topstitchFree.tsx` | `Free Topstitch` | `Pespunte libre` |
| `topstitchSeamline.tsx` | `Seamline Topstitch` | `Pespunte sobre costura` |
| `topstitchSegment.tsx` | `Segment Topstitch` | `Pespunte por tramo` |
| `topstitchEdit.tsx` | `Edit Topstitch` | `Editar pespunte` |

> **De dónde salen.** Los 13 del dock copian su etiqueta de `DOCK_2D_CATALOG` — es lo que ella acaba de clicar. Los 14 restantes copian la etiqueta que `src/shortcuts/defaults.ts` ya trae aprobada. **Ninguno se inventa.**

> **No tocar `copilot.description`, `examples` ni `keywords`.** Son para el LLM y siguen en inglés.

- [ ] **Paso 4: Correr los tests y verlos pasar**

```bash
npx vitest run src/tools src/components/shell
```

Esperado: los dos casos nuevos PASAN, y el tercer test de la Task 1 (`'Seleccionar'`) se pone verde.

Si algún test existente esperaba un nombre en inglés, **se actualiza** — la regla 3 del glosario lo dice: los tests se actualizan con los `aria-label` y las etiquetas, no al revés.

- [ ] **Paso 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint
git add src/tools/definitions src/tools/__tests__/nombresDeHerramienta.test.ts
git commit -m "feat(idioma): un nombre por herramienta, en español — dock y definición atados por test"
```

---

## Task 4: Idioma — las 7 del dock

18 etiquetas de opción y 29 de desplegable en las herramientas que están en el dock.

**Files:**
- Modify: `pen.tsx`, `rectangle.tsx`, `scissors.tsx`, `measure.tsx`, `seam.tsx`, `notch.tsx` de `src/tools/definitions/`
- Test: `src/tools/__tests__/idiomaDeOpciones.test.ts` (crear)

**Interfaces:**
- Produces: el test `idiomaDeOpciones.test.ts` con la lista de las 7. La Task 5 extiende la misma lista a 20.

- [ ] **Paso 1: Escribir el guardia que falla**

Crear `src/tools/__tests__/idiomaDeOpciones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../index';

/** Instantánea congelada. Cada entrada es toolId → { optionId → [label, ...choiceLabels] }.
 *  Una etiqueta nueva en inglés rompe este test. Es lo único que impide que la
 *  próxima herramienta reintroduzca la deriva que #1049 arregla. */
const ESPERADO: Record<string, Record<string, string[]>> = {
  point: {
    mode: ['Tipo de punto', 'Punto', 'Curva por puntos', 'Curva bezier'],
  },
  pen: {
    smoothing: ['Suavizar'],
    snapGrid: ['Ajustar a la cuadrícula'],
    constrainAngles: ['Restringir ángulos', 'Libre', '45°', '90°'],
  },
  rectangle: {
    width: ['Ancho'],
    height: ['Alto'],
    cornerStyle: ['Esquinas', 'Rectas', 'Redondeadas', 'Achaflanadas'],
  },
  scissors: {
    cutType: ['Tipo de corte', 'Recto', 'Curvo'],
    keepBoth: ['Conservar las dos partes'],
    autoSew: ['Coser el corte automáticamente'],
    seamType: ['Tipo de costura', 'Normal', 'Francesa', 'Rebatida', 'Overlock'],
  },
  measure: {
    showAngle: ['Mostrar el ángulo'],
    cumulative: ['Distancia acumulada'],
  },
  seam: {
    seamType: ['Tipo de costura', 'Normal', 'Francesa', 'Rebatida', 'Overlock'],
    stitchLength: ['Largo de puntada'],
  },
  notch: {
    shape: [
      'Forma del piquete',
      'Corte', 'En T', 'V hacia adentro', 'V hacia afuera',
      'En U', 'Almena', 'Rombo',
    ],
    length: ['Profundidad (mm)'],
    count: ['Cantidad', 'Uno', 'Dos', 'Tres'],
  },
};

describe('idioma de las opciones de herramienta', () => {
  for (const [toolId, opciones] of Object.entries(ESPERADO)) {
    it(`${toolId}: etiquetas en español`, () => {
      const definicion = toolRegistry.getTool(toolId);
      expect(definicion, `${toolId} no está registrada`).toBeDefined();

      for (const [optionId, cadenas] of Object.entries(opciones)) {
        const opcion = definicion!.options?.find((o) => o.id === optionId);
        expect(opcion, `${toolId}.${optionId} no existe`).toBeDefined();

        const reales = [
          opcion!.label,
          ...(opcion!.choices?.map((c) => c.label) ?? []),
        ];
        expect(reales).toEqual(cadenas);
      }
    });
  }

  it('no hay opciones sin cubrir en las herramientas listadas', () => {
    for (const [toolId, opciones] of Object.entries(ESPERADO)) {
      const declaradas = toolRegistry.getTool(toolId)!.options?.map((o) => o.id) ?? [];
      expect(declaradas.sort()).toEqual(Object.keys(opciones).sort());
    }
  });
});
```

> El último caso es el que hace de trinquete de verdad: si alguien **añade** una opción a una herramienta cubierta y no la traduce, el test falla aunque no haya tocado las existentes.

- [ ] **Paso 2: Correr y verlo fallar**

```bash
npx vitest run src/tools/__tests__/idiomaDeOpciones.test.ts
```

Esperado: `point` PASA (ya estaba en español); las otras seis FALLAN mostrando el inglés real.

- [ ] **Paso 3: Traducir**

Cambiar solo `label` y `choices[].label`. **Los `value` no se tocan.**

**`pen.tsx`**

| id | `label` hoy | `label` nuevo | choices |
|---|---|---|---|
| `smoothing` | Smoothing | Suavizar | — |
| `snapGrid` | Snap to Grid | Ajustar a la cuadrícula | — |
| `constrainAngles` | Constrain Angles | Restringir ángulos | `none`: None → **Libre** · `45`: 45° *(sin cambio)* · `90`: 90° *(sin cambio)* |

**`rectangle.tsx`**

| id | `label` hoy | `label` nuevo | choices |
|---|---|---|---|
| `width` | Width | Ancho | — |
| `height` | Height | Alto | — |
| `cornerStyle` | Corner Style | Esquinas | `square`: Square → **Rectas** · `rounded`: Rounded → **Redondeadas** · `chamfered`: Chamfered → **Achaflanadas** |

**`scissors.tsx`**

| id | `label` hoy | `label` nuevo | choices |
|---|---|---|---|
| `cutType` | Cut Type | Tipo de corte | `straight`: Straight → **Recto** · `curved`: Curved → **Curvo** |
| `keepBoth` | Keep Both Sides | Conservar las dos partes | — |
| `autoSew` | Auto-Sew Cut | Coser el corte automáticamente | — |
| `seamType` | Seam Type | Tipo de costura | `standard`: Standard → **Normal** · `french`: French → **Francesa** · `flat-felled`: Flat-felled → **Rebatida** · `overlock`: Overlock *(sin cambio)* |

**`measure.tsx`**

| id | `label` hoy | `label` nuevo |
|---|---|---|
| `showAngle` | Show Angle | Mostrar el ángulo |
| `cumulative` | Cumulative Distance | Distancia acumulada |

**`seam.tsx`**

| id | `label` hoy | `label` nuevo | choices |
|---|---|---|---|
| `seamType` | Seam Type | Tipo de costura | igual que `scissors.seamType` (ojo: aquí el label de `flat-felled` está escrito `Flat-Felled`, con F mayúscula) |
| `stitchLength` | Stitch Length | Largo de puntada | — |

**`notch.tsx`**

| id | `label` hoy | `label` nuevo | choices |
|---|---|---|---|
| `shape` | Notch Shape | Forma del piquete | `slit`: Slit → **Corte** · `t-notch`: T-Notch → **En T** · `v-internal`: V Internal → **V hacia adentro** · `v-external`: V External → **V hacia afuera** · `u-notch`: U-Notch → **En U** · `castle`: Castle → **Almena** · `diamond`: Diamond → **Rombo** |
| `length` | Depth (mm) | Profundidad (mm) | — |
| `count` | Count | Cantidad | `1`: Single → **Uno** · `2`: Double → **Dos** · `3`: Triple → **Tres** |

- [ ] **Paso 4: Correr y verlo pasar**

```bash
npx vitest run src/tools
```

Esperado: 8 de 8 PASAN.

`PieceProperties.tsx` pinta a mano las opciones de piquete y puede tener tests que esperen el inglés: **se actualizan**.

- [ ] **Paso 5: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint
git add src/tools/definitions src/tools/__tests__/idiomaDeOpciones.test.ts
git commit -m "feat(idioma): las 7 herramientas del dock hablan español"
```

---

## Task 5: Idioma — las 13 de solo atajo

34 etiquetas de opción y 43 de desplegable en las herramientas que solo se alcanzan por teclado.

**Files:**
- Modify: `transform.tsx`, `circle.tsx`, `trace.tsx`, `dart.tsx`, `pin.tsx`, `walkSeam.tsx`, `polyPen.tsx`, `pomMeasure.tsx`, `offsetOutline.tsx`, `extendTrim.tsx`, `topstitchFree.tsx`, `topstitchSeamline.tsx`, `topstitchSegment.tsx`
- Modify: `src/tools/__tests__/idiomaDeOpciones.test.ts`

**Interfaces:**
- Consumes: la constante `ESPERADO` de la Task 4. Se extiende, no se reescribe.

- [ ] **Paso 1: Extender el guardia y verlo fallar**

Añadir a `ESPERADO` en `src/tools/__tests__/idiomaDeOpciones.test.ts`:

```ts
  transform: {
    mode: ['Transformación', 'Escalar', 'Girar', 'Inclinar'],
    uniform: ['Escalar proporcional'],
  },
  circle: {
    shapeType: ['Figura', 'Círculo', 'Elipse', 'Arco'],
    radius: ['Radio'],
  },
  trace: {
    offset: ['Separación (mm)'],
  },
  dart: {
    dartWidth: ['Ancho (mm)'],
    dartDepth: ['Largo (mm)'],
    capShape: ['Forma de la punta', 'En punta', 'Curva', 'Plana', 'Rombo'],
    segments: ['Tramos'],
  },
  pin: {
    pinStrength: ['Fuerza de la fijación', 'Suave', 'Media', 'Fuerte'],
  },
  walkSeam: {
    tolerance: ['Tolerancia', '1 mm', '3 mm', '5 mm'],
    ghostOpacity: ['Opacidad del calco'],
  },
  polyPen: {
    mode: ['Dibujar', 'Pieza nueva', 'Línea interna'],
    lineType: ['Tipo de línea', 'Doblez', 'Referencia', 'Pespunte'],
    snapGrid: ['Ajustar a la cuadrícula'],
  },
  pomMeasure: {
    method: ['Método', 'En línea recta', 'Siguiendo el borde'],
    defaultCategory: ['Categoría', 'Largo', 'Ancho', 'Otra'],
  },
  offsetOutline: {
    distance: ['Distancia (mm)'],
    direction: ['Dirección', 'Hacia afuera', 'Hacia adentro', 'Las dos'],
    joinType: ['Unión de esquinas', 'Redondeada', 'En punta', 'Recta'],
    replace: ['Reemplazar el original'],
  },
  extendTrim: {
    mode: ['Acción', 'Extender', 'Recortar'],
    distance: ['Distancia (mm)'],
  },
  topstitchFree: {
    stitchType: ['Tipo de puntada', 'Recta', 'Zigzag', 'Triple'],
    stitchLength: ['Largo de puntada (mm)'],
    threadColor: ['Color del hilo'],
  },
  topstitchSeamline: {
    stitchType: ['Tipo de puntada', 'Recta', 'Zigzag', 'Triple'],
    stitchLength: ['Largo de puntada (mm)'],
    offset: ['Separación (mm)'],
    threadColor: ['Color del hilo'],
  },
  topstitchSegment: {
    stitchType: ['Tipo de puntada', 'Recta', 'Zigzag', 'Triple'],
    stitchLength: ['Largo de puntada (mm)'],
    offset: ['Separación (mm)'],
    threadColor: ['Color del hilo'],
  },
```

```bash
npx vitest run src/tools/__tests__/idiomaDeOpciones.test.ts
```

Esperado: las 13 nuevas FALLAN.

- [ ] **Paso 2: Traducir**

Solo `label` y `choices[].label`. Los `value` no se tocan. El mapeo inglés→español es exactamente el de la constante del paso anterior; las correspondencias por `value` que no son obvias:

- `transform.mode`: `scale`→Escalar · `rotate`→Girar · `skew`→Inclinar
- `circle.shapeType`: `circle`→Círculo · `ellipse`→Elipse · `arc`→Arco
- `dart.capShape`: `pointed`→En punta · `curved`→Curva · `flat`→Plana · `diamond`→Rombo
- `pin.pinStrength`: `weak`→Suave · `medium`→Media · `strong`→Fuerte
- `walkSeam.tolerance`: `1`→1 mm · `3`→3 mm · `5`→5 mm *(se le mete el espacio antes de la unidad)*
- `polyPen.mode`: `piece`→Pieza nueva · `internalLine`→Línea interna
- `polyPen.lineType`: `fold`→Doblez · `reference`→Referencia · `topstitch`→Pespunte
- `pomMeasure.method`: `straight`→En línea recta · `alongEdge`→Siguiendo el borde
- `pomMeasure.defaultCategory`: `length`→Largo · `width`→Ancho · `custom`→Otra
- `offsetOutline.direction`: `outward`→Hacia afuera · `inward`→Hacia adentro · `both`→Las dos
- `offsetOutline.joinType`: `round`→Redondeada · `miter`→En punta · `square`→Recta
- `extendTrim.mode`: `extend`→Extender · `trim`→Recortar
- `topstitch*.stitchType`: `straight`→Recta · `zigzag`→Zigzag · `triple`→Triple

**Dos no son traducción, son corrección de oficio** (spec §5.4) — hay que hacerlas aunque parezcan raras al lado del inglés:

- **`dart.dartDepth`** dice `Depth (mm)` y se traduce **`Largo (mm)`**. En una pinza, "depth" es de la boca al vértice: eso es el largo. La profundidad es de piquete, no de pinza.
- **`walkSeam.ghostOpacity`** dice `Ghost Opacity` y se traduce **`Opacidad del calco`**. El *ghost* es la copia translúcida de la pieza que se recorre; en el oficio eso es un calco.

- [ ] **Paso 3: Correr y verlo pasar**

```bash
npx vitest run src/tools
```

Esperado: 21 de 21 PASAN (20 herramientas + el caso de cobertura).

- [ ] **Paso 4: Gates y commit**

```bash
npx tsc -b --noEmit && npm run test && npm run lint
git add src/tools/definitions src/tools/__tests__/idiomaDeOpciones.test.ts
git commit -m "feat(idioma): las 13 herramientas de solo atajo hablan español"
```

---

## Task 6: Borrar el estado fantasma

`optionsPanelCollapsed` y `expertShowOverride` se escriben y nadie los lee. Con el canal permanente, el primero deja de tener sentido; el segundo solo lo tendría si el modo experto tuviera puerta, y no la tiene.

**Files:**
- Modify: `src/store/toolSlice.ts`
- Modify: los tests de `toolSlice` que los afirmen

- [ ] **Paso 1: Comprobar que de verdad nadie los lee**

```bash
grep -rn "optionsPanelCollapsed\|expertShowOverride\|setExpertShowOverride" src/ --include=*.ts --include=*.tsx | grep -v "store/toolSlice.ts"
```

Esperado: **solo salen archivos de test**. Si sale un componente, **para y repórtalo** — la premisa de esta tarea sería falsa y hay que decidir de nuevo.

- [ ] **Paso 2: Ajustar los tests primero**

Dos sitios:

- En los tests de `src/store/__tests__/` que afirmen esos campos, quitar las aserciones y los casos que solo existan para ellos.
- En `src/components/shell/__tests__/ToolOptionsBar2D.test.tsx`, quitar de `preloadedState` las dos líneas `optionsPanelCollapsed: false` y `expertShowOverride: false` que la Task 1 puso ahí precisamente para esto.

Aquí el test se adapta al contrato nuevo, no lo dirige: se corre después del paso 3, no antes.

- [ ] **Paso 3: Borrar los campos**

En `src/store/toolSlice.ts`:

- Quitar `optionsPanelCollapsed: boolean` y `expertShowOverride: boolean` de `ToolState` (líneas 10-11).
- Quitar sus dos entradas de `initialState` (19-20).
- En `setActiveTool2D` y `setActiveTool3D`, la rama de re-clic pierde su cuerpo. Queda:

```ts
    setActiveTool2D(state, action: PayloadAction<string>) {
      const toolId = action.payload;
      // Re-clicar la misma herramienta no hace nada: la barra de opciones es
      // permanente y no se pliega (#1049).
      if (state.activeTool2D === toolId) return;
      state.activeTool2D = toolId;
      state.recentTools = [toolId, ...state.recentTools.filter(id => id !== toolId)].slice(0, 5);
    },
```

y lo mismo en `setActiveTool3D` con `activeTool3D`.

- Borrar el reducer `setExpertShowOverride` y su export.

- [ ] **Paso 4: Correr la suite entera**

```bash
npx tsc -b --noEmit && npm run test
```

El typecheck es el que caza a cualquiera que quede referenciando los campos. Esperado: verde.

- [ ] **Paso 5: Commit**

```bash
git add src/store/toolSlice.ts src/store/__tests__
git commit -m "refactor(tools): borrar optionsPanelCollapsed y expertShowOverride — estado sin un solo lector"
```

---

## Task 7: El caso de María, y el cierre

Los dos e2e que faltan, la enmienda del glosario y los gates completos.

**Files:**
- Modify: `tests/e2e/barra-opciones-herramienta.spec.ts`
- Modify: `docs/specs/2026-07-16-ui-copy-es-glosario.md`
- Modify: `scripts/ui-contract-baseline.json` (solo si algún contador bajó)

- [ ] **Paso 1: Escribir los dos casos que faltan**

Añadir a `tests/e2e/barra-opciones-herramienta.spec.ts`:

```ts
  test('los tres modos de Punto se alcanzan y cambian el estado', async ({ page }) => {
    // Es la promesa literal de la NOTA de la entrega 12 a María.
    await page.getByRole('button', { name: 'Punto' }).click();

    const select = page.getByLabel('Tipo de punto');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveText([
      'Punto', 'Curva por puntos', 'Curva bezier',
    ]);

    await select.selectOption('curvePoints');

    const modo = await page.evaluate(
      () =>
        (window as unknown as {
          __VINA_STORE__: { getState: () => { tools: { toolOptions: Record<string, Record<string, unknown>> } } };
        }).__VINA_STORE__.getState().tools.toolOptions.point.mode,
    );
    expect(modo).toBe('curvePoints');
  });

  test('con un panel abierto la barra hace scroll y el documento no encoge', async ({ page }) => {
    // Tijeras declara 4 opciones: es la que primero no cabe.
    await page.getByRole('button', { name: 'Tijeras' }).click();
    const antes = await page.locator('.canvas-area__2d').boundingBox();

    await page.getByRole('button', { name: 'Capas' }).click();
    const despues = await page.locator('.canvas-area__2d').boundingBox();
    const barra = page.locator('.tool-options-bar');

    // La barra desborda dentro de sí misma, nunca empuja.
    const desborda = await barra.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(desborda).toBe(true);
    expect(despues!.width).toBeLessThan(antes!.width); // encogió por el panel, no por la barra
    const anchoBarra = (await barra.boundingBox())!.width;
    expect(anchoBarra).toBeLessThanOrEqual(despues!.width);
  });
```

> El store está expuesto como `window.__VINA_STORE__`; es el mismo que usa `emplazamiento-paneles.spec.ts` para sembrar y leer estado. No inventar otro.

- [ ] **Paso 2: Correrlos y verlos fallar, luego pasar**

```bash
npx playwright test barra-opciones-herramienta.spec.ts --workers=2 --retries=0
```

Los dos deberían pasar sin código nuevo: las Tasks 1-5 ya los habilitan. **Si pasan a la primera, comprueba que de verdad discriminan** — cambia `curvePoints` por un valor inventado y confirma que el test se pone rojo. Un e2e que pasa sin haber fallado nunca no es una red.

- [ ] **Paso 3: Enmendar el glosario**

En `docs/specs/2026-07-16-ui-copy-es-glosario.md`, en la tabla "Términos del oficio", debajo de la fila de `grainline`:

```markdown
| thread (hilo de coser) | hilo | "Color del hilo" en pespunte. Comparte palabra con grainline a propósito: el contexto separa, y grainline tiene su forma larga ("dirección de hilo") para desambiguar. Decidido en #1049. |
```

- [ ] **Paso 4: Los gates completos**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
node scripts/ui-contract-lint.mjs
```

Si algún contador **bajó**, fijar el techo nuevo:

```bash
node scripts/ui-contract-lint.mjs --update
```

Si alguno **subió**, arreglarlo. Nunca editar el baseline a mano.

- [ ] **Paso 5: La suite e2e entera**

```bash
npx playwright test --workers=2 --retries=0
```

Cinco fallos son **preexistentes y están diagnosticados** (4 aserciones en inglés en `ik-solver.spec.ts` y `bundle-split.spec.ts:36`, más un error de Three.js TSL en `bundle-split.spec.ts:70`). Confírmalos idénticos contra `main` antes de darlos por ajenos; cualquier fallo nuevo es de esta rama.

- [ ] **Paso 6: Commit final**

```bash
git add tests/e2e/barra-opciones-herramienta.spec.ts \
        docs/specs/2026-07-16-ui-copy-es-glosario.md \
        scripts/ui-contract-baseline.json
git commit -m "test(opciones): el caso de María end-to-end + enmienda de glosario"
```

---

## Lo que este plan deja escrito, y no arregla

Todo esto está en la spec (§10) y ninguno entra aquí:

- **`point.tsx:29-30` afirma algo falso.** Dice que el sub-modo "persiste entre activaciones vía `toolMemory`", y no persiste: `confirmationMiddleware.ts:129` solo lo restaura si `expertMode`, que es siempre `false`. Sus elecciones **sí** se guardan (`:200` espeja cada `setToolOption`) y nunca se le devuelven.
- **El modo experto no tiene puerta.** `expertMode` decide si una acción destructiva pregunta (`useGuardedAction.ts:114`) y nadie lo puede encender.
- **El dock escribe sus atajos a mano** (`shortcut: '⇧L'`), así que muestra el predeterminado aunque esté remapeado. La barra sí lee el efectivo.
- **Seis herramientas 2D vivas sin ninguna puerta**: `autoTrace`, `mirror`, `slashAndSpread`, `trimPlace`, `measureCurve`, `compareCurves`. Es #1049 un nivel más arriba.
- **El gemelo 3D.** Los dos renderers murieron en `ad208464`; este plan repone uno.
- **La sección de piquete duplicada en `PieceProperties.tsx:26-34`.** Escribe el mismo estado, así que no se desincroniza.
