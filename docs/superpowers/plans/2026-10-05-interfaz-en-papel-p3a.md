# Interfaz en papel — P3a: la cabina de la pieza

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pieza seleccionada enseñe lo justo: una barrita de cuatro acciones, el candado en el menú del clic derecho (y «Desbloquear» primero cuando la pieza está bloqueada), y una sola cota a la vez.

**Architecture:**
- **Barrita.** La fila `piece` de `actionCuration.ts` pierde el candado y el tope baja a cuatro. `resolveBarActions` pone «Desbloquear» delante con una pieza bloqueada.
- **Cuándo se ve.** `shouldShowActionBar` deja la barrita a la vista con la pieza bloqueada, donde la caja de transformación no está; en todo lo demás sigue a la caja.
- **Una cota a la vez.** `cotas/unaALaVez.ts` decide qué cota de la pieza se ve y a cuál pasa el Tab. `CotaChip` le pregunta a la capa (`onSalir`) antes de soltar el foco, y `PatternEditor` guarda el turno y abre la cota siguiente.

**Tech Stack:** React + Redux Toolkit, Vitest + Testing Library (jsdom), Playwright (e2e contra el Vite de 5174).

**Spec:** `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (v3). Secciones que aplica:
- § 5.1: qué aparece con cada acción.
- § 5.5: la cabina de la pieza.
- § 11: la fila P3.

## Global Constraints

- **Idioma.** Español de Venezuela con tuteo, sentence case, sin «¡» ni «por favor». Los términos salen del glosario `docs/specs/2026-07-16-ui-copy-es-glosario.md` (pieza, costura, margen, piquete, pinza, tramo). Los `aria-label` también van en español.
- **Contrato de interfaz** (`.claude/skills/contrato-de-interfaz/SKILL.md`):
  - solo tokens de `src/styles/tokens.css`, sin `var(--x, fallback)` y sin color literal;
  - todo `:hover` lleva su `:focus-visible`;
  - todo portal y todo lo que flota nace papel (`data-material="papel"`);
  - ningún `z-index` literal nuevo;
  - una sola notación de atajo, vía `shortcutDisplay.ts`.
- **Superficies.** Toda superficie nueva declara `data-superficie` con el vocabulario de `tests/repo/superficies-declaradas.test.ts`.
- **La caja negra ve todo gesto nuevo** (`pushJournal`).
- **Gates del repo:**
  - el typecheck es `npx tsc -b --noEmit`;
  - nada de `--no-verify`;
  - `node scripts/ui-contract-lint.mjs` no sube ningún contador.
- **Por tarea.** Cada tarea cierra con la suite entera (`npm run test`), no solo con sus tests.
- **Trinquetes.** Sus líneas base solo se escriben con `*_UPDATE=1 … --retries=0 --workers=1`.
- **E2e en curso.** Con un e2e corriendo no se editan archivos de la app: el Vite de 5174 recarga.
- **Archivos.** Ids con `newId()` de `src/utils/ids.ts`, y `git add` con rutas explícitas.

## Review Focus

1. **Varias piezas, la primera bloqueada.** La barrita de la selección no ofrece desbloquear solo esa. → Task 1.
2. **Arrastrar una pieza bloqueada.** La barrita, ahora visible con la pieza bloqueada, se esconde mientras dura el arrastre y vuelve al soltar. → Task 1 (e2e).
3. **Tab sobre el chip en reposo**, sin abrirlo, desde Ancho. Pasa a Alto; no se va a la línea al pie. → Task 2.
4. **El turno y la selección.** Otra selección, o volver a hacer clic en la pieza, empieza por Ancho. Confirmar Alto no devuelve a Ancho. → Task 2.
5. **Las herramientas que crean la pieza.** Rectángulo, Círculo y Triángulo conservan sus dos cotas y el «300 Tab 150 Enter». → Task 2 (unitario) y los e2e del gate que ya lo miden (`cotas-de-pieza`, `replay-maria-07-09`).

## Decisiones de este plan

1. **P3 se parte en tres**, como se partió P2. Cada parte tiene su plan, su PR y su despliegue:
   - **P3a, la cabina:** la barrita de cuatro, la regla del candado y una cota a la vez;
   - **P3b, la cota de lo que se pone:** el piquete sin modal con su cota viva, «Ajustar distancia…» por esa cota, y el punto con cota;
   - **P3c, la etiqueta y la puerta de vuelta:** la etiqueta de opción, el piquete ya puesto con su etiqueta, y la costura y la esquina del margen seleccionables con Seleccionar, cada una con su etiqueta de tipo.

   El reconocimiento del 05-10 lo pide: la costura no se pinta con Seleccionar, la esquina solo se alcanza con Margen, y la forma, la cantidad y el ancho de un piquete ya puesto no tienen puerta hoy. P3 no es M.
2. **Rama.** `feat/interfaz-en-papel-p3a` sale de `main` (`d94e4390`), que ya tiene P2 entera.
3. **La barrita** de una pieza es Rotar 90°, Duplicar, Voltear horizontal y Propiedades…, y el tope (`BAR_MAX_VISIBLE`) baja de 5 a 4.
   - El candado ya está en el menú del clic derecho (grupo «organize»), así que no se mueve: solo sale de la barrita.
   - La cita de la spec («hoy es el quinto») es su sitio en la barrita, no en el menú.
4. **«Desbloquear», primero.** Con una sola pieza bloqueada, la barrita es «Desbloquear», Duplicar y Propiedades…: rotar y voltear caen por su gate. Con varias piezas no hay candado, porque desbloquearía solo la primera.
5. **La barrita con la pieza bloqueada se ve, aunque la caja no esté.**
   - Hoy se escondía con la caja, y «Desbloquear» quedaba detrás del menú.
   - Conserva el anclaje de siempre, 32 px sobre la caja, aunque no haya asa de giro: así no salta al bloquear.
6. **Una cota a la vez** vale en Seleccionar y en Transformar, con la pieza como sujeto.
   - Se ve Ancho. Tab, en edición o en reposo, pasa a Alto, que ocupa su sitio, y abre su edición. Shift+Tab vuelve.
   - Desde la última cota, Tab sale a la línea al pie como hoy.
   - Otra selección empieza por Ancho, y también un clic nuevo en la pieza, que la vuelve a seleccionar.
   - Rectángulo, Círculo y Triángulo conservan las dos (§ 5.1: «caja con sus dos cotas»): su caja son sus medidas.
   - La puerta del lado (#1167) no cambia: Tab desde el lienzo sigue abriendo el lado más cercano al ratón.
7. **Los largos.** Con «Largos» encendido, el lado que se queda sin chip enseña su lectura: cuatro lados, cuatro medidas. Es la regla de `CotasLayer` («solo el chip que está presente sobre este lado sustituye su lectura»).

## Archivos

| Archivo | Qué |
|---|---|
| `src/components/PatternEditor/actionCuration.ts` | La fila `piece` sin candado, tope 4, «Desbloquear» primero. |
| `src/components/PatternEditor/useEditorInteractions.ts` | `shouldShowActionBar` y `showActionBar`. |
| `src/components/PatternEditor/FloatingActionBar.tsx` | Monta con `showActionBar` (comentario y prop). |
| `src/components/PatternEditor/cotas/unaALaVez.ts` (nuevo) | `cotasALaVista`, `pasarTurno`, `TURNO_INICIAL`. |
| `src/components/PatternEditor/cotas/CotaChip.tsx` | `onSalir`. |
| `src/components/PatternEditor/cotas/CotasLayer.tsx` | Pasa `onSalir`. |
| `src/components/PatternEditor/PatternEditor.tsx` | La barrita con `showActionBar`; el turno de la cota. |
| `tests/e2e/la-cabina-de-la-pieza.spec.ts` (nuevo) | La red de P3a, al gate. |
| `tests/e2e/cotas-de-pieza.spec.ts`, `lo-que-se-ve-y-cuando.spec.ts`, `replay-maria-07-09.spec.ts` | Alto, por Tab. |
| `scripts/deploy-prod.sh`, `tests/repo/el-gate-corre-los-trinquetes.test.ts` | El spec nuevo, al gate. |
| `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` | Nota del plan en § 5.5. |

---

### Task 1: La barrita de cuatro, y el candado al clic derecho

**Files:**
- Modify: `src/components/PatternEditor/actionCuration.ts:129-132,359-364,454-463`
- Modify: `src/components/PatternEditor/useEditorInteractions.ts:303-327,396-402,1530`
- Modify: `src/components/PatternEditor/FloatingActionBar.tsx:1-8,30-31`
- Modify: `src/components/PatternEditor/PatternEditor.tsx:823,1725`
- Test: `src/components/PatternEditor/__tests__/actionCuration.test.ts`, `__tests__/FloatingActionBar.test.tsx`, `__tests__/useEditorInteractions.transformBox.test.ts`
- Create: `tests/e2e/la-cabina-de-la-pieza.spec.ts`

**Interfaces:**
- Produces:
  - `shouldShowActionBar(opts: { activeTool: Tool2D; isNodeEditing: boolean; selectedCount: number; selectionHasLocked: boolean; hasSelectedInternalLine?: boolean }): boolean`;
  - `showActionBar: boolean` en lo que devuelve `useEditorInteractions`;
  - `BAR_MAX_VISIBLE === 4`.

- [ ] **Step 1: Los tests de la curaduría (rojo)**

En `src/components/PatternEditor/__tests__/actionCuration.test.ts`:

Sustituye el caso del tope:

```ts
  it('bar autorada no excede el cap de 5', () => {
    for (const row of CURATION) {
      expect(row.bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    }
  });
```

por:

```ts
  it('la barrita es de cuatro (spec 2026-10-02 § 5.5) y ninguna fila autora más', () => {
    expect(BAR_MAX_VISIBLE).toBe(4);
    for (const row of CURATION) {
      expect(row.bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    }
  });
```

Y en `describe('resolveBarActions — cap, no-danger y BAR_ENABLED_KINDS', …)` sustituye el primer caso:

```ts
  it('pieza desbloqueada: barra rankeada, ≤5, sin danger', () => {
    const bar = resolveBarActions(makeCtx()).map(d => d.id);
    expect(bar).toEqual(['rotate90', 'duplicate', 'flipH', 'properties', 'lockToggle']);
    expect(bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    for (const id of bar) expect(ACTIONS[id].danger).not.toBe(true);
  });
```

por:

```ts
  it('pieza desbloqueada: la barrita de cuatro, sin el candado, que vive en el menú', () => {
    const bar = resolveBarActions(makeCtx()).map(d => d.id);
    expect(bar).toEqual(['rotate90', 'duplicate', 'flipH', 'properties']);
    expect(bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    for (const id of bar) expect(ACTIONS[id].danger).not.toBe(true);
    expect(resolveMenuActions(makeCtx()).map(d => d.id)).toContain('lockToggle');
  });
  it('pieza bloqueada: «Desbloquear» va primero; rotar y voltear caen por su gate', () => {
    const ctx = makeCtx({ piece: pieceFix(true), pieces: [pieceFix(true)] });
    const bar = resolveBarActions(ctx);
    expect(bar.map(d => d.id)).toEqual(['lockToggle', 'duplicate', 'properties']);
    const label = bar[0].label;
    expect(typeof label === 'function' ? label(ctx) : label).toBe('Desbloquear');
  });
  it('varias piezas con la primera bloqueada: la barrita de la selección no desbloquea solo esa', () => {
    const ctx = makeCtx({ targetKind: 'multiPiece', piece: pieceFix(true), selectedPieceIds: ['p1', 'p2'] });
    expect(resolveBarActions(ctx).map(d => d.id)).not.toContain('lockToggle');
  });
```

- [ ] **Step 2: Los tests de la barrita y de cuándo se ve (rojo)**

En `src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx`, en «renderiza icon-only…», cambia:

```ts
    expect(buttons).toHaveLength(5); // rotate90, duplicate, flipH, properties, lockToggle
```

por:

```ts
    expect(buttons).toHaveLength(4); // rotate90, duplicate, flipH, properties
```

y añade a ese `describe`:

```ts
  it('con la pieza bloqueada, «Desbloquear» va primero, con su icono', () => {
    renderBar({ ctx: makeCtx({ piece: pieceFix(true), pieces: [pieceFix(true)] }) });
    const [primero] = screen.getAllByRole('button');
    expect(primero.getAttribute('aria-label')).toBe('Desbloquear');
    expect(primero.querySelector('svg')).toBeTruthy();
  });
```

En `src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts`, cambia el import:

```ts
import { shouldShowActionBar, shouldShowTransformBox } from '../useEditorInteractions';
```

En el caso «oculta con una interna seleccionada…», el comentario de arriba dice «se suprimen el box Y la FloatingActionBar (comparten este mismo booleano)». Cámbialo por «se suprimen el box y la FloatingActionBar, que lo sigue (`shouldShowActionBar`)». Y añade al final del archivo:

```ts
describe('shouldShowActionBar (spec 2026-10-02 § 5.5)', () => {
  const base = { activeTool: 'select' as const, isNodeEditing: false, selectedCount: 1, selectionHasLocked: false };

  it('con la pieza bloqueada no hay caja, pero sí barrita: «Desbloquear» no queda detrás de un menú', () => {
    const bloqueada = { ...base, selectionHasLocked: true };
    expect(shouldShowTransformBox(bloqueada)).toBe(false);
    expect(shouldShowActionBar(bloqueada)).toBe(true);
  });

  it('en todo lo demás sigue a la caja: sin selección, editando nodos, con una interna o en otra herramienta, no está', () => {
    expect(shouldShowActionBar({ ...base, selectedCount: 0 })).toBe(false);
    expect(shouldShowActionBar({ ...base, isNodeEditing: true })).toBe(false);
    expect(shouldShowActionBar({ ...base, hasSelectedInternalLine: true })).toBe(false);
    expect(shouldShowActionBar({ ...base, activeTool: 'rectangle' })).toBe(false);
  });
});
```

- [ ] **Step 3: El e2e de la barrita (rojo)**

Crea `tests/e2e/la-cabina-de-la-pieza.spec.ts`:

```ts
/**
 * La cabina de la pieza (spec 2026-10-02 § 5.5, P3a): la barrita de cuatro,
 * la regla del candado y una cota a la vez. Es un e2e porque la barrita y los
 * chips son capas HTML ancladas con pan y zoom, y el foco del Tab solo es de
 * verdad en un navegador.
 */
import { test, expect, type Page } from '@playwright/test';
import { abrirAppVacia } from './helpers/estados';
import { addPiece, activarHerramienta, clickAt, dispatch, st, toScreen } from './helpers/lienzo';

const barrita = (page: Page) => page.locator('.floating-action-bar');
const bloqueada = (page: Page) => page.evaluate(() =>
  (window as unknown as { __VINA_STORE__: { getState: () => { project: { pieces: Array<{ locked?: boolean }> } } } })
    .__VINA_STORE__.getState().project.pieces[0].locked === true);

async function unaPiezaSeleccionada(page: Page) {
  await abrirAppVacia(page);
  await addPiece(page, 'p1', { x: 100, y: 100 }, 300, 200);
  await activarHerramienta(page, 'z', 'select');
  await clickAt(page, { x: 250, y: 200 });
  await expect.poll(async () => (await st(page)).editor.selectedPieceIds).toEqual(['p1']);
}

test.describe('la cabina de la pieza (P3a)', () => {
  test.setTimeout(90_000);

  test('la barrita trae cuatro acciones; el candado vive en el menú del clic derecho', async ({ page }) => {
    await unaPiezaSeleccionada(page);
    await expect(barrita(page).getByRole('button')).toHaveCount(4);
    for (const nombre of ['Rotar 90°', 'Duplicar', 'Voltear horizontal', 'Propiedades…']) {
      await expect(barrita(page).getByRole('button', { name: nombre, exact: true })).toBeVisible();
    }
    await clickAt(page, { x: 250, y: 200 }, 'right');
    await page.getByText('Bloquear', { exact: true }).click();
    await expect.poll(() => bloqueada(page)).toBe(true);
  });

  test('con la pieza bloqueada no hay caja, pero la barrita trae «Desbloquear» primero', async ({ page }) => {
    await unaPiezaSeleccionada(page);
    await dispatch(page, 'project/lockPiece', 'p1');
    const primero = barrita(page).getByRole('button').first();
    await expect(primero).toHaveAttribute('aria-label', 'Desbloquear');
    await primero.click();
    await expect.poll(() => bloqueada(page)).toBe(false);
    await expect(barrita(page).getByRole('button', { name: 'Rotar 90°', exact: true })).toBeVisible();
  });

  test('arrastrar la pieza bloqueada esconde la barrita mientras dura el gesto', async ({ page }) => {
    await unaPiezaSeleccionada(page);
    await dispatch(page, 'project/lockPiece', 'p1');
    await expect(barrita(page)).toBeVisible();
    const desde = await toScreen(page, { x: 250, y: 200 });
    await page.mouse.move(desde.x, desde.y);
    await page.mouse.down();
    await page.mouse.move(desde.x + 40, desde.y + 20, { steps: 6 });
    await expect(barrita(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(barrita(page)).toBeVisible();
  });
});
```

- [ ] **Step 4: Verlos caer**

Run: `npx vitest run src/components/PatternEditor/__tests__/actionCuration.test.ts src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts`

Expected: FAIL en estos casos:
- el tope (`expected 5 to be 4`);
- la barrita desbloqueada (trae `lockToggle` al final);
- la bloqueada (`['duplicate', 'properties', 'lockToggle']`);
- los 4 botones (salen 5);
- «Desbloquear» primero (sale «Duplicar»);
- `shouldShowActionBar is not a function`.

«Varias piezas con la primera bloqueada» pasa ya: es la guarda de la regla del candado, que solo vale con una pieza.

Run (Vite arriba en 5174): `npx playwright test tests/e2e/la-cabina-de-la-pieza.spec.ts --workers=1 --retries=0`

Expected: 3 failed. Hoy la barrita trae cinco botones, y con la pieza bloqueada no se ve.

- [ ] **Step 5: La curaduría**

En `src/components/PatternEditor/actionCuration.ts`, cambia:

```ts
export const BAR_MAX_VISIBLE = 5;
```

por:

```ts
/** La barrita es de cuatro (spec 2026-10-02 § 5.5). */
export const BAR_MAX_VISIBLE = 4;
```

En la leyenda de `CURATION`, «`bar` rankeada (cap 5, apagada salvo BAR_ENABLED_KINDS)» pasa a «`bar` rankeada (cap 4, apagada salvo BAR_ENABLED_KINDS)». En la fila `piece`:

```ts
    bar: ['rotate90', 'duplicate', 'flipH', 'properties', 'lockToggle'],
```

pasa a:

```ts
    bar: ['rotate90', 'duplicate', 'flipH', 'properties'],
```

Y `resolveBarActions` queda así:

```ts
/** Barra (Surface A): solo BAR_ENABLED_KINDS, sin danger, gate aplicado, cap 4.
 *  La regla del candado (spec 2026-10-02 § 5.5): bloquear vive en el menú del
 *  clic derecho; con UNA pieza bloqueada, «Desbloquear» va primero, para que
 *  nunca quede detrás de un menú. Con varias no: desbloquearía solo la primera. */
export function resolveBarActions(ctx: CurationCtx): ActionDef[] {
  if (!BAR_ENABLED_KINDS.has(ctx.targetKind)) return [];
  const row = matchRow({ targetKind: ctx.targetKind, stage: ctx.stage, altitude: ctx.altitude });
  if (!row) return [];
  const ids: ActionId[] = ctx.targetKind === 'piece' && ctx.piece?.locked ? ['lockToggle', ...row.bar] : row.bar;
  return ids
    .map(id => ACTIONS[id]).filter(Boolean)
    .filter(def => !def.danger && (!def.gate || def.gate(ctx)))
    .slice(0, BAR_MAX_VISIBLE);
}
```

- [ ] **Step 6: Cuándo se ve la barrita**

En `src/components/PatternEditor/useEditorInteractions.ts`, debajo de `shouldShowTransformBox`:

```ts
/**
 * La barrita de la pieza (spec 2026-10-02 § 5.5) sigue a la caja, con una
 * excepción: con la selección bloqueada la caja no está y la barrita sí, para
 * que «Desbloquear» nunca quede detrás de un menú.
 */
export function shouldShowActionBar(opts: Parameters<typeof shouldShowTransformBox>[0]): boolean {
  return shouldShowTransformBox({ ...opts, selectionHasLocked: false });
}
```

Dentro del hook, justo debajo de `const showTransformBox = … && !isDraggingPiece;`:

```ts
  const showActionBar = shouldShowActionBar({
    activeTool,
    isNodeEditing,
    selectedCount: selectedPieceIds.length,
    selectionHasLocked,
    hasSelectedInternalLine: selectedInternalLineIsLive,
  }) && !isDraggingPiece;
```

y el `return` final del hook gana `showActionBar`:

```ts
  return { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave, handlePointerCancel, getCursor, selectMarquee, showTransformBox, showActionBar, isDraggingPiece, isDraggingEndpoint };
```

En `src/components/PatternEditor/PatternEditor.tsx`, la desestructuración de `useEditorInteractions` (línea ~823) gana `showActionBar` (al lado de `showTransformBox`), y el montaje de la barrita cambia:

```tsx
        show={showTransformBox}
```

por:

```tsx
        show={showActionBar}
```

En `src/components/PatternEditor/FloatingActionBar.tsx`, el comentario de cabecera dice «Cabalga T2–T5: monta cuando `showTransformBox` es true (⇒ suprimida en altitud POINT por construcción, invariante G7), se ancla a `transformTool.bbox`». Pasa a «Monta con `showActionBar`: la caja de transformación, salvo con la pieza bloqueada, donde la caja no está y la barrita sí (spec 2026-10-02 § 5.5); suprimida en altitud POINT por construcción (invariante G7). Se ancla a `transformTool.bbox`». El comentario de la prop `show`:

```ts
  /** showTransformBox (T2): monta SOLO si es true → POINT suprimido por construcción. */
```

pasa a:

```ts
  /** showActionBar: monta SOLO si es true → POINT suprimido por construcción. */
```

- [ ] **Step 7: Verlos pasar**

Run: `npx vitest run src/components/PatternEditor/__tests__/actionCuration.test.ts src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts src/components/PatternEditor/__tests__/barIcons.test.ts`
Expected: PASS.

Run (Vite arriba): `npx playwright test tests/e2e/la-cabina-de-la-pieza.spec.ts --workers=1 --retries=0`
Expected: 3 passed.

- [ ] **Step 8: La suite entera y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

```bash
git add src/components/PatternEditor/actionCuration.ts src/components/PatternEditor/useEditorInteractions.ts src/components/PatternEditor/FloatingActionBar.tsx src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/__tests__/actionCuration.test.ts src/components/PatternEditor/__tests__/FloatingActionBar.test.tsx src/components/PatternEditor/__tests__/useEditorInteractions.transformBox.test.ts tests/e2e/la-cabina-de-la-pieza.spec.ts
git commit -m "feat(cabina): la barrita de cuatro; el candado al clic derecho, y «Desbloquear» primero con la pieza bloqueada"
```

---

### Task 2: Una cota a la vez

**Files:**
- Create: `src/components/PatternEditor/cotas/unaALaVez.ts`
- Create: `src/components/PatternEditor/cotas/__tests__/unaALaVez.test.ts`
- Modify: `src/components/PatternEditor/cotas/CotaChip.tsx:9-23,109-162,346-350`
- Modify: `src/components/PatternEditor/cotas/CotasLayer.tsx:18-38,48,161-173`
- Modify: `src/components/PatternEditor/PatternEditor.tsx` (el turno; `cotasVisibles` en `CotaLines`, `AgruparCotas` y `CotasLayer`)
- Test: `src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx`
- Modify: `tests/e2e/la-cabina-de-la-pieza.spec.ts`, `tests/e2e/cotas-de-pieza.spec.ts:176-179`, `tests/e2e/lo-que-se-ve-y-cuando.spec.ts:158,166-170`, `tests/e2e/replay-maria-07-09.spec.ts:488-493`

**Interfaces:**
- Consumes: `Sujeto` (`cotas/sujeto.ts:60-83`), `Cota` (`cotas/cotas.ts`), `cotasDePieza(piece)`.
- Produces:
  - `interface TurnoDeCota { seleccion: readonly string[] | null; indice: number }`;
  - `TURNO_INICIAL: TurnoDeCota`;
  - `cotasALaVista(sujeto: Sujeto, activeTool: Tool2D, turno: TurnoDeCota, seleccion: readonly string[]): Cota[]`;
  - `pasarTurno(sujeto, activeTool, turno, seleccion, hacia: 'siguiente' | 'anterior'): TurnoDeCota | null`;
  - `CotaChipProps.onSalir?: (hacia: 'siguiente' | 'anterior') => boolean`;
  - `CotasLayerProps.onSalir?`.

- [ ] **Step 1: El test de la regla (rojo)**

Crea `src/components/PatternEditor/cotas/__tests__/unaALaVez.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../../../types/types';
import { cotasDePieza } from '../cotas';
import type { Sujeto } from '../sujeto';
import { cotasALaVista, pasarTurno, TURNO_INICIAL } from '../unaALaVez';

/**
 * Una cota de la pieza a la vez (spec 2026-10-02 § 5.5): Seleccionar y
 * Transformar enseñan Ancho, y Tab pasa a Alto. Las herramientas que crean la
 * pieza conservan las dos: su caja son sus medidas.
 */
const pieza = {
  id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true, layer: 1,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [300, 0] },
    { type: 'L', values: [300, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] },
  ],
  internals: [], seamAllowance: 0,
} as unknown as PatternPiece;

const sujetoPieza = (): Sujeto => ({
  piece: pieza, caliente: false, cotas: cotasDePieza(pieza), lectura: null, lecturaApagada: false,
  bordeLeido: null, disabled: false, esPieza: true,
});

const seleccion = ['p1'];

describe('cotasALaVista', () => {
  it('Seleccionar con una pieza: solo Ancho', () => {
    expect(cotasALaVista(sujetoPieza(), 'select', TURNO_INICIAL, seleccion).map(c => c.id)).toEqual(['ancho']);
  });
  it('Transformar también', () => {
    expect(cotasALaVista(sujetoPieza(), 'transform', TURNO_INICIAL, seleccion).map(c => c.id)).toEqual(['ancho']);
  });
  it('con el turno en Alto para esta selección, Alto ocupa su sitio', () => {
    expect(cotasALaVista(sujetoPieza(), 'select', { seleccion, indice: 1 }, seleccion).map(c => c.id)).toEqual(['alto']);
  });
  it('otra selección (otro arreglo, aunque diga lo mismo) vuelve a Ancho', () => {
    expect(cotasALaVista(sujetoPieza(), 'select', { seleccion, indice: 1 }, ['p1']).map(c => c.id)).toEqual(['ancho']);
  });
  it('Rectángulo, Círculo y Triángulo conservan las dos', () => {
    for (const herramienta of ['rectangle', 'circle', 'triangle'] as const) {
      expect(cotasALaVista(sujetoPieza(), herramienta, TURNO_INICIAL, seleccion).map(c => c.id)).toEqual(['ancho', 'alto']);
    }
  });
  it('un sujeto que no es la pieza (el lado de #1167) sale tal cual', () => {
    const lado = { ...sujetoPieza(), esPieza: false };
    expect(cotasALaVista(lado, 'select', TURNO_INICIAL, seleccion)).toBe(lado.cotas);
  });
});

describe('pasarTurno', () => {
  it('Tab desde Ancho pasa a Alto', () => {
    expect(pasarTurno(sujetoPieza(), 'select', TURNO_INICIAL, seleccion, 'siguiente')).toEqual({ seleccion, indice: 1 });
  });
  it('Tab desde Alto no tiene a dónde: sigue a la línea al pie', () => {
    expect(pasarTurno(sujetoPieza(), 'select', { seleccion, indice: 1 }, seleccion, 'siguiente')).toBeNull();
  });
  it('Shift+Tab desde Alto vuelve a Ancho; desde Ancho no tiene a dónde', () => {
    expect(pasarTurno(sujetoPieza(), 'select', { seleccion, indice: 1 }, seleccion, 'anterior')).toEqual({ seleccion, indice: 0 });
    expect(pasarTurno(sujetoPieza(), 'select', TURNO_INICIAL, seleccion, 'anterior')).toBeNull();
  });
  it('en Rectángulo el Tab es el de siempre', () => {
    expect(pasarTurno(sujetoPieza(), 'rectangle', TURNO_INICIAL, seleccion, 'siguiente')).toBeNull();
  });
});
```

- [ ] **Step 2: Los tests del chip (rojo)**

Añade al final de `src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx`:

```tsx
describe('CotaChip - una cota a la vez (spec 2026-10-02 § 5.5)', () => {
  it('Tab en edición confirma y le pregunta a la capa si hay otra cota del objeto', () => {
    const onSalir = vi.fn(() => true);
    const props = monta({ onSalir });
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '150' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });
    expect(props.onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'ancho' }), 150, 'tab');
    expect(onSalir).toHaveBeenCalledWith('siguiente');
  });
  it('si la capa dice que no, el Tab sigue su camino de siempre, a la línea al pie', () => {
    const noop = { onCommit: vi.fn(), onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(), onScrubCancel: vi.fn() };
    const onSalir = vi.fn(() => false);
    render(
      <div>
        <div className="cotas"><CotaChip cota={cota()} left={0} top={0} zoom2D={1} onSalir={onSalir} {...noop} /></div>
        <div className="seccion-del-patron"><select aria-label="Tipo"><option>a</option></select></div>
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });
    expect(onSalir).toHaveBeenCalledWith('siguiente');
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Tipo' }));
  });
  it('en reposo, Tab sobre el chip también pasa de turno, y el Tab nativo no se va', () => {
    const onSalir = vi.fn(() => true);
    monta({ onSalir });
    expect(fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab', shiftKey: true })).toBe(false);
    expect(onSalir).toHaveBeenCalledWith('anterior');
  });
  it('en reposo, si la capa dice que no, el Tab nativo sigue', () => {
    monta({ onSalir: () => false });
    expect(fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' })).toBe(true);
  });
});
```

- [ ] **Step 3: Los e2e (rojo)**

Añade a `tests/e2e/la-cabina-de-la-pieza.spec.ts`, dentro del `describe`:

```ts
  test('una cota a la vez: Ancho a la vista; Tab desde ella pasa a Alto, que ocupa su sitio', async ({ page }) => {
    const chip = (nombre: 'Ancho' | 'Alto') => page.getByRole('button', { name: new RegExp(`^${nombre} de la pieza:`) });
    const campo = (nombre: 'Ancho' | 'Alto') => page.locator(`input.cota--editando[aria-label="${nombre} de la pieza"]`);
    await unaPiezaSeleccionada(page);
    await expect(chip('Ancho')).toHaveText('300 mm');
    await expect(chip('Alto')).toHaveCount(0);

    // En edición: Tab pasa a Alto, abierto y listo para teclear.
    await chip('Ancho').click();
    await page.keyboard.press('Tab');
    await expect(campo('Alto')).toBeFocused();
    await expect(chip('Ancho')).toHaveCount(0);
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await expect(chip('Alto')).toHaveText('150 mm');
    await expect(chip('Ancho'), 'confirmar Alto no devuelve a Ancho').toHaveCount(0);

    // En reposo: Shift+Tab sobre el chip vuelve a Ancho.
    await chip('Alto').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(campo('Ancho')).toBeFocused();
    await page.keyboard.press('Escape');

    // Otra pieza empieza por Ancho.
    await addPiece(page, 'p2', { x: 500, y: 100 }, 120, 90);
    await clickAt(page, { x: 560, y: 145 });
    await expect(chip('Ancho')).toHaveText('120 mm');
    await expect(chip('Alto')).toHaveCount(0);
  });
```

Los tres e2e que esperaban Alto a la vista con Seleccionar:

1. `tests/e2e/cotas-de-pieza.spec.ts`, caso «pieza girada…», cambia:

```ts
    const ancho = await cota(page, 'Ancho').boundingBox();
    const alto = await cota(page, 'Alto').boundingBox();
    if (!ancho || !alto) throw new Error('sin chips');
    // girada 90°: el chip de Ancho queda a un lado (no arriba) y el de Alto arriba o abajo
```

por:

```ts
    const ancho = await cota(page, 'Ancho').boundingBox();
    if (!ancho) throw new Error('sin chip de Ancho');
    // Una cota a la vez (spec 2026-10-02 § 5.5): en Seleccionar solo se ve Ancho.
    await expect(cota(page, 'Alto')).toHaveCount(0);
    // girada 90°: el chip de Ancho queda a un lado (no arriba)
```

2. `tests/e2e/lo-que-se-ve-y-cuando.spec.ts`, caso D3 «rectángulo seleccionado: ningún número repetido», cambia:

```ts
    await expect(chipPieza(page, 'Alto')).toBeVisible();
```

por:

```ts
    await expect(chipPieza(page, 'Alto'), 'una cota a la vez (spec 2026-10-02 § 5.5)').toHaveCount(0);
```

y en el comentario de abajo, «cuatro medidas — Ancho (arriba), Alto (derecha) y las lecturas de los dos lados que ningún chip cubre» pasa a «cuatro medidas — Ancho (arriba) y las lecturas de los tres lados que ningún chip cubre (desde P3a se ve una cota a la vez)». La cuenta sigue en 4.

3. `tests/e2e/replay-maria-07-09.spec.ts`, cambia:

```ts
      // El paso 5 subió un asa 45 mm: los extremos siguen delimitando 300×150,
      // pero el bbox vivo (y por tanto su chip Alto) crece de 150 a 195.
      await expect(page.getByRole('button', { name: /^Alto de la pieza:/ }),
        'el chip editable toma el alto vivo tras moldear, no el dato viejo').toHaveText('195 mm');
```

por:

```ts
      // El paso 5 subió un asa 45 mm: los extremos siguen delimitando 300×150,
      // pero el bbox vivo (y por tanto su cota Alto) crece de 150 a 195. Una
      // cota a la vez (spec 2026-10-02 § 5.5): Alto se alcanza con Tab.
      await page.getByRole('button', { name: /^Ancho de la pieza:/ }).click();
      await page.keyboard.press('Tab');
      await expect(page.locator('input.cota--editando[aria-label="Alto de la pieza"]'),
        'la cota editable toma el alto vivo tras moldear, no el dato viejo').toHaveValue('195');
      await page.keyboard.press('Escape');
```

- [ ] **Step 4: Verlos caer**

Run: `npx vitest run src/components/PatternEditor/cotas/__tests__/unaALaVez.test.ts src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx`

Expected: FAIL. `unaALaVez.test.ts` no resuelve `../unaALaVez`, y en `CotaChip.test.tsx` caen los tres primeros casos nuevos, porque `onSalir` nunca se llama. El cuarto pasa ya: es la guarda del Tab nativo.

Run (Vite arriba): `npx playwright test tests/e2e/la-cabina-de-la-pieza.spec.ts tests/e2e/cotas-de-pieza.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts --workers=2 --retries=0`

Expected: FAIL en el caso nuevo de la cabina y en los dos que ahora esperan Alto fuera de la vista (hoy sale).

- [ ] **Step 5: La regla**

Crea `src/components/PatternEditor/cotas/unaALaVez.ts`:

```ts
import type { Tool2D } from '../../../types/types';
import type { Cota } from './cotas';
import type { Sujeto } from './sujeto';

/**
 * Una cota de la pieza a la vez (spec 2026-10-02 § 5.5): «las medidas de la
 * caja no son las de la pieza», y María pidió el 07-09 que no se quedaran
 * «ahí pegado todo el rato». Seleccionar y Transformar enseñan una; Tab desde
 * su chip pasa a la siguiente, que ocupa su sitio. Las que crean la pieza
 * (Rectángulo, Círculo, Triángulo) siguen con las dos: su caja son sus
 * medidas, y el «300 Tab 150 Enter» se escribe ahí.
 */
const UNA_A_LA_VEZ: ReadonlySet<Tool2D> = new Set<Tool2D>(['select', 'transform']);

/** De quién es el turno: la selección en la que se pulsó Tab, y qué cota. Otra selección vuelve a la primera. */
export interface TurnoDeCota {
  seleccion: readonly string[] | null;
  indice: number;
}

export const TURNO_INICIAL: TurnoDeCota = { seleccion: null, indice: 0 };

function aplica(sujeto: Sujeto, activeTool: Tool2D): boolean {
  return sujeto.esPieza && UNA_A_LA_VEZ.has(activeTool) && sujeto.cotas.length > 1;
}

// La selección se compara por identidad: Redux solo rehace el arreglo cuando
// se selecciona, así que un clic nuevo en la pieza vuelve a la primera cota y
// confirmar una cota (que no toca la selección) conserva el turno.
function indiceVivo(turno: TurnoDeCota, seleccion: readonly string[], cuantas: number): number {
  return turno.seleccion === seleccion ? Math.min(turno.indice, cuantas - 1) : 0;
}

export function cotasALaVista(sujeto: Sujeto, activeTool: Tool2D, turno: TurnoDeCota, seleccion: readonly string[]): Cota[] {
  if (!aplica(sujeto, activeTool)) return sujeto.cotas;
  return [sujeto.cotas[indiceVivo(turno, seleccion, sujeto.cotas.length)]];
}

/**
 * El Tab que sale de un chip: pasa a la cota siguiente (o a la anterior, con
 * Shift) del mismo objeto. `null` = no hay a dónde: el Tab sigue su camino de
 * siempre, a la línea al pie hacia adelante, y se queda hacia atrás.
 */
export function pasarTurno(
  sujeto: Sujeto,
  activeTool: Tool2D,
  turno: TurnoDeCota,
  seleccion: readonly string[],
  hacia: 'siguiente' | 'anterior',
): TurnoDeCota | null {
  if (!aplica(sujeto, activeTool)) return null;
  const indice = indiceVivo(turno, seleccion, sujeto.cotas.length) + (hacia === 'siguiente' ? 1 : -1);
  if (indice < 0 || indice >= sujeto.cotas.length) return null;
  return { seleccion, indice };
}
```

- [ ] **Step 6: El chip le pregunta a la capa**

En `src/components/PatternEditor/cotas/CotaChip.tsx`, `CotaChipProps` gana, al final:

```ts
  /**
   * Una cota a la vez (spec 2026-10-02 § 5.5): el Tab que sale del chip le
   * pregunta a la capa si hay otra cota del mismo objeto. `true` = la capa
   * pasó de turno y abre la siguiente; el chip no mueve el foco.
   */
  onSalir?: (hacia: 'siguiente' | 'anterior') => boolean;
```

`ChipEditable` recibe `onSalir` en su desestructuración (después de `onScrubCancel`) y lo guarda por ref, como el resto de callbacks que leen los efectos:

```ts
  // Por ref: el efecto de abajo corre al cerrar la edición, y con la prop en
  // sus dependencias se repetiría (y volvería a seleccionar el texto) cada vez
  // que el editor se pinta de nuevo.
  const onSalirRef = useRef(onSalir);
  onSalirRef.current = onSalir;
```

En el efecto que mueve el foco al cerrar, debajo de `if (destino === 'boton' || !boton) { boton?.focus(); return; }`:

```ts
    if (onSalirRef.current?.(destino)) return;
```

Y el `onKeyDown` del botón en reposo queda:

```tsx
      onKeyDown={(e) => {
        // Espacio y Enter son del botón (abren la edición por el clic
        // nativo); que no lleguen al atajo global de simular ni al router.
        if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
        // Una cota a la vez: Tab sobre el chip pasa a la siguiente del objeto.
        if (e.key === 'Tab' && onSalirRef.current?.(e.shiftKey ? 'anterior' : 'siguiente')) e.preventDefault();
      }}
```

En `src/components/PatternEditor/cotas/CotasLayer.tsx`, `CotasLayerProps` gana:

```ts
  /** Una cota a la vez: lo que el chip consulta antes de soltar el foco con Tab. */
  onSalir?: CotaChipProps['onSalir'];
```

la desestructuración de la capa añade `onSalir`, y cada `<CotaChip>` recibe `onSalir={onSalir}`.

- [ ] **Step 7: El turno en el editor**

En `src/components/PatternEditor/PatternEditor.tsx`, importa:

```ts
import { cotasALaVista, pasarTurno, TURNO_INICIAL, type TurnoDeCota } from './cotas/unaALaVez';
```

Debajo del efecto de la puerta del lado (el que termina con `}, [puertaDeLado.seq, puertaDeLado.lado]);`):

```ts
  // Una cota de la pieza a la vez (spec 2026-10-02 § 5.5). El turno vive
  // aquí porque es de la vista: qué cota se ve no es un dato del proyecto.
  // Como el tramo congelado y el lado, la cota siguiente no existe hasta el
  // render que la monta: se cuenta la secuencia y entonces se abre.
  const [turnoDeCota, setTurnoDeCota] = useState<TurnoDeCota>(TURNO_INICIAL);
  const [abrirTurno, setAbrirTurno] = useState(0);
  const cotasVisibles = useMemo(
    () => cotasALaVista(sujeto, activeTool, turnoDeCota, selectedPieceIds),
    [sujeto, activeTool, turnoDeCota, selectedPieceIds],
  );
  const salirDeLaCota = useCallback((hacia: 'siguiente' | 'anterior'): boolean => {
    const siguiente = pasarTurno(sujeto, activeTool, turnoDeCota, selectedPieceIds, hacia);
    if (!siguiente) return false;
    setTurnoDeCota(siguiente);
    setAbrirTurno(n => n + 1);
    pushJournal('gesture', 'cota:turno', { hacia, indice: siguiente.indice });
    return true;
  }, [sujeto, activeTool, turnoDeCota, selectedPieceIds]);
  const turnoVisto = useRef(0);
  useEffect(() => {
    if (turnoVisto.current === abrirTurno) return;
    turnoVisto.current = abrirTurno;
    cotasRef.current?.abrirPrimero();
  }, [abrirTurno]);
```

Y en el JSX, las tres capas que pintan las cotas del sujeto leen `cotasVisibles`:
- `<CotaLines cotas={sujeto.cotas} zoom2D={zoom2D} />` → `<CotaLines cotas={cotasVisibles} zoom2D={zoom2D} />`;
- `<AgruparCotas cotas={sujeto.cotas} …>` → `<AgruparCotas cotas={cotasVisibles} …>`;
- en `<CotasLayer …>`, `cotas={sujeto.cotas}` → `cotas={cotasVisibles}`, y añade `onSalir={salirDeLaCota}`.

`cotasVisibles: sujeto.cotas.length > 0` (la frase de la línea al pie) no cambia: la pieza sigue teniendo cotas.

- [ ] **Step 8: Verlos pasar**

Run: `npx vitest run src/components/PatternEditor/cotas src/components/PatternEditor/__tests__`
Expected: PASS.

Run (Vite arriba): `npx playwright test tests/e2e/la-cabina-de-la-pieza.spec.ts tests/e2e/cotas-de-pieza.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts tests/e2e/replay-maria-07-09.spec.ts tests/e2e/1167-editar-los-largos-de-la-pieza.spec.ts tests/e2e/seis-firmas-maria.spec.ts tests/e2e/maria-191-rectangulo-con-medidas.spec.ts --workers=2 --retries=0`
Expected: todo pasa.

- [ ] **Step 9: La suite entera y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

```bash
git add src/components/PatternEditor/cotas/unaALaVez.ts src/components/PatternEditor/cotas/__tests__/unaALaVez.test.ts src/components/PatternEditor/cotas/CotaChip.tsx src/components/PatternEditor/cotas/CotasLayer.tsx src/components/PatternEditor/cotas/__tests__/CotaChip.test.tsx src/components/PatternEditor/PatternEditor.tsx tests/e2e/la-cabina-de-la-pieza.spec.ts tests/e2e/cotas-de-pieza.spec.ts tests/e2e/lo-que-se-ve-y-cuando.spec.ts tests/e2e/replay-maria-07-09.spec.ts
git commit -m "feat(cotas): una cota de la pieza a la vez; Tab pasa a la siguiente, que ocupa su sitio"
```

---

### Task 3: Al gate, a la spec, y los trinquetes sin subir

**Files:**
- Modify: `scripts/deploy-prod.sh` (lista e2e del gate)
- Modify: `tests/repo/el-gate-corre-los-trinquetes.test.ts`
- Modify: `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md` (§ 5.5)

- [ ] **Step 1: El test del gate (rojo)**

En `tests/repo/el-gate-corre-los-trinquetes.test.ts`, antes de «cada spec de la lista existe en disco»:

```ts
  it('y la red de la cabina de la pieza (P3a): la barrita de cuatro y una cota a la vez', () => {
    expect(specsDelGate()).toContain('tests/e2e/la-cabina-de-la-pieza.spec.ts');
  });
```

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts`
Expected: FAIL (`la-cabina-de-la-pieza.spec.ts` no está en la lista).

- [ ] **Step 2: Al gate**

En `scripts/deploy-prod.sh`, en la lista del `npx playwright test --workers=2 \`, debajo de `  tests/e2e/ia-convocada.spec.ts \`:

```bash
  tests/e2e/la-cabina-de-la-pieza.spec.ts \
```

El archivo tiene que seguir en LF: `tr -cd '\015' < scripts/deploy-prod.sh | wc -c` da 0, y `bash -n scripts/deploy-prod.sh` no se queja.

Run: `npx vitest run tests/repo/el-gate-corre-los-trinquetes.test.ts`
Expected: PASS.

- [ ] **Step 3: La nota en la spec**

En `docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md`, al final de § 5.5, sin tocar el texto de antes:

> **Nota del plan de P3a (2026-10-05).**
>
> - P3 se parte en tres: P3a (la cabina), P3b (la cota de lo que se pone: piquete y punto) y P3c (la etiqueta de opción y la puerta de vuelta).
> - El candado ya estaba en el menú del clic derecho; solo sale de la barrita.
> - Con la pieza bloqueada la caja no está y la barrita sí: «Desbloquear», Duplicar, Propiedades….
> - Una cota a la vez vale en Seleccionar y Transformar. Rectángulo, Círculo y Triángulo conservan las dos. Tab, en edición o en reposo, pasa a la siguiente; una selección nueva empieza por Ancho.
> - El `#1a1a1a` de la barrita ya se había ido en P1b.

- [ ] **Step 4: Los trinquetes no suben**

Run (Vite arriba): `npx playwright test tests/e2e/reposo-solo-lo-que-perdura.spec.ts tests/e2e/superficies-por-accion.spec.ts tests/e2e/contraste-del-cromo.spec.ts --workers=1 --retries=0`
Expected: todo pasa.
- Si algún estado midió por debajo de su línea base, se fija con el `*_UPDATE=1` de ese trinquete y se commitea el JSON.
- Si algo sube, es un hallazgo: se arregla, no se toca la línea base.

- [ ] **Step 5: El gate entero y el commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`
Expected: todo verde.

```bash
git add scripts/deploy-prod.sh tests/repo/el-gate-corre-los-trinquetes.test.ts docs/superpowers/specs/2026-10-02-interfaz-en-papel-design.md
git commit -m "test(cabina): la red de P3a al gate, y la spec anota cómo se parte P3"
```

El ensayo del deploy (`bash scripts/deploy-prod.sh --ensayo`) corre después de la revisión final y su pase de arreglos, sobre el árbol final.
