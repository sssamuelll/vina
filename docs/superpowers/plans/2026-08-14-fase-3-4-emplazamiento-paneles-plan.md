# Fase 3+4 del contrato de interfaz: emplazamiento y modelo de paneles — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la ley de emplazamiento del contrato de interfaz: 40 `z-index` literales pasan a la escala con nombre o a aislamiento local (Ola 1, mecánica), y los 7 paneles de contenido dejan de flotar sobre el lienzo para empujarlo de verdad, con dos ranuras (izquierda/derecha) en vez de una (Ola 2, arquitectónica). Los docks de herramientas y la barra de IA se quedan flotando, a propósito — no se tocan.

**Architecture:** Ola 1 es puramente mecánica: cada z-index literal se reemplaza por `var(--z-*)` (existente o `--z-hint`, nuevo) donde compite globalmente, o gana `isolation: isolate` + una variable CSS local donde es orden interno de un solo componente. Ola 2 reemplaza el estado `contextPanel: string | null` de `AppShell.tsx` por un hook `usePanelHost()` con dos ranuras independientes y dos operaciones (`openPanel` que garantiza abierto, `togglePanel` que alterna), y convierte `ContextPanel` de tarjeta flotante a hijo flex real de `canvas-area`, con `canvas-area__2d`/`__3d` pasando de `width: N%` a `flex-grow` para que el layout no se desborde.

**Tech Stack:** React + Redux + TypeScript, Vitest (jsdom) para lectura de CSS/comportamiento, Playwright para e2e, `scripts/ui-contract-lint.mjs` como guardián (trinquete: falla si un contador sube).

**Spec:** `docs/superpowers/specs/2026-08-14-fase-3-4-emplazamiento-paneles-design.md`

## Global Constraints

- **Sin `--no-verify`.** El hook de pre-commit corre `tsc -b --noEmit`, `lint-staged` y `node scripts/ui-contract-lint.mjs`. Ninguno se salta.
- **El trinquete solo baja.** Si una tarea sube algún contador de `ui-contract-lint.mjs`, es un fallo de esa tarea — se arregla, nunca se toca `scripts/ui-contract-baseline.json` a mano salvo con `--update` cuando el contador bajó de verdad.
- **`jsdom` no calcula layout.** `getBoundingClientRect()` da 0 siempre — ninguna aserción de ancho/alto real de un elemento va en vitest; esas verificaciones son manuales, en el navegador, contra el DXF real de María (`tests/fixtures/garments/maria_patrones_samuel_2M.dxf`).
- **Los docks y la barra de IA no se tocan.** `DockShell.tsx`, `Dock.css` (salvo su z-index), `barPosition.ts`, y el mecanismo de posición de `UnifiedBar` quedan exactamente como están. Solo cambia su z-index (Ola 1, mecánico).
- **`getPanelSide()` no cambia.** Sigue siendo la única fuente de verdad de qué panel va a cuál lado.
- **Corrección encontrada al escribir este plan, no en la spec:** los 7 archivos de test y 4 specs e2e que la spec marcaba como "a actualizar" **no necesitan ningún cambio** — los 7 tests mockean `onOpenPanel` como prop genérica de los componentes hijos (que no cambia de nombre ni de firma) y solo comprueban con qué string se llamó; los 4 e2e comprueban `.context-panel__header` y clases que el diseño conserva. Quedan como tarea de **verificación** (correr y confirmar verdes), no de edición.

---

# PARTE 1 — OLA 1: escala de z-index (mecánica)

## Task 1: Arreglar el bug de truncamiento del linter

**Files:**
- Modify: `scripts/ui-contract-lint.mjs`
- Test: manual (correr el propio script — es una herramienta de desarrollo, no tiene suite propia)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `--list <regla>` muestra el valor completo capturado por la regex, no solo el primer dígito.

- [ ] **Step 1: Reproducir el bug**

```bash
node scripts/ui-contract-lint.mjs --list R8 2>/dev/null | grep "unified-bar"
```

Esperado: `unified-bar.css:5  z-index: 1` (el valor real en el archivo es `100` — el `1` es el bug).

- [ ] **Step 2: Leer `countMatches` en el script**

Abrir `scripts/ui-contract-lint.mjs`, localizar la función `countMatches`. El regex de la regla R8 es `/z-index:\s*-?\d/` — solo exige **un** dígito, así que `found[0]` (el texto capturado para mostrar) corta ahí. El *conteo* de sitios es correcto (cada `match` cuenta una vez sin importar cuántos dígitos tenga el número); solo el *texto mostrado* en `--list` está mal.

- [ ] **Step 3: Corregir el regex de R8 para capturar el número completo, sin tocar el conteo**

En la definición de la regla `R8` (`key: 'zIndexLiteral'`), donde dice:

```js
run: () => [
  ...countMatches(cssFiles(), /z-index:\s*-?\d/),
  ...countMatches(codeFiles(), /zIndex:\s*-?\d/),
],
```

cambiar a:

```js
run: () => [
  ...countMatches(cssFiles(), /z-index:\s*-?\d+/),
  ...countMatches(codeFiles(), /zIndex:\s*-?\d+/),
],
```

(`\d` → `\d+`: captura todos los dígitos, no solo el primero. El conteo de sitios no cambia — sigue siendo un match por sitio.)

- [ ] **Step 4: Verificar que el conteo total no cambió y que el texto mostrado sí**

```bash
node scripts/ui-contract-lint.mjs 2>&1 | grep "R8"
```

Esperado: `41` en la columna "hoy", igual que antes del cambio (el conteo de sitios es el mismo, arreglar el regex de captura no agrega ni quita coincidencias).

```bash
node scripts/ui-contract-lint.mjs --list R8 2>/dev/null | grep "unified-bar"
```

Esperado ahora: `unified-bar.css:5  z-index: 100` (el valor real).

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-contract-lint.mjs
git commit -m "fix(lint): --list mostraba el z-index cortado a un dígito"
```

---

## Task 2: Token `--z-hint` + test de roles de z-index (RED)

**Files:**
- Modify: `src/styles/tokens.css`
- Create: `src/styles/__tests__/zIndexScale.test.ts`

**Interfaces:**
- Produces: token `--z-hint: 200` en `tokens.css`. El test `zIndexScale.test.ts` es la referencia de qué archivo debe usar qué token — Task 3 lo pone en verde.

- [ ] **Step 1: Agregar el token nuevo**

En `src/styles/tokens.css`, dentro del bloque de la escala de capas (después de `--z-toast: 1200;`, antes del `}` de cierre en la línea 185):

```css
  /* Overlay transitorio de arrastre (aviso de soltar-DXF). Mismo valor que
   * --z-menu (200) porque comparte su urgencia — algo que hay que ver de
   * inmediato mientras dura, pero no bloquea como un modal — con rol propio
   * porque semánticamente no es un menú. */
  --z-hint: 200;
```

- [ ] **Step 2: Escribir el test de roles (falla porque el CSS todavía no migró)**

Crear `src/styles/__tests__/zIndexScale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ley de emplazamiento (§ 5.2 del informe 2026-08-14, § 2.3 de la spec de
 * Fase 3+4): los 14 sitios de z-index que compiten de verdad en el espacio
 * global pasan a la escala con nombre. Esto no es solo "sin literal" —
 * ui-contract-lint.mjs ya cuenta eso — es que el ORDEN entre roles sea el
 * correcto: un modal por encima de un menú contextual, un toast por encima
 * de un modal. Antes de esta fase, CalibrationModal y el menú contextual
 * compartían el mismo 1000; ConnectionModal (que SÍ tiene velo) estaba al
 * nivel de un menú (200); NotchPrecisionModal (que el propio archivo dice
 * "deliberately no scrim") estaba al nivel de un modal (1000).
 */

function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), 'utf8');
}

function valorDeToken(css: string, token: string): number {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(-?\\d+)`));
  if (!m) throw new Error(`Token ${token} no encontrado`);
  return Number(m[1]);
}

const tokens = leer('src/styles/tokens.css');
const ZD = valorDeToken(tokens, '--z-dock');
const ZP = valorDeToken(tokens, '--z-panel');
const ZBar = valorDeToken(tokens, '--z-bar');
const ZM = valorDeToken(tokens, '--z-menu');
const ZH = valorDeToken(tokens, '--z-hint');
const ZCM = valorDeToken(tokens, '--z-context-menu');
const ZMod = valorDeToken(tokens, '--z-modal');
const ZT = valorDeToken(tokens, '--z-toast');

describe('la escala de z-index ordena por urgencia, no por antigüedad', () => {
  it('dock < barra < menú < menú-contextual < modal < toast', () => {
    expect(ZD).toBeLessThan(ZBar);
    expect(ZBar).toBeLessThan(ZM);
    expect(ZM).toBeLessThan(ZCM);
    expect(ZCM).toBeLessThan(ZMod);
    expect(ZMod).toBeLessThan(ZT);
  });

  it('--z-panel existe para SolverMetrics, aunque ContextPanel ya no lo use', () => {
    expect(ZP).toBeGreaterThan(0);
  });
});

/** Cada fila: archivo, patrón que debe existir en el archivo (var(--token) o
 *  var(--token) + N para los anidados), y una nota de por qué. */
const SITIOS_GLOBALES: Array<{ archivo: string; patron: RegExp; nota: string }> = [
  { archivo: 'src/components/shell/Dock.css', patron: /z-index:\s*var\(--z-dock\)/, nota: 'dock' },
  { archivo: 'src/styles/layout.css', patron: /\.top-bar\s*\{[^}]*z-index:\s*var\(--z-bar\)/, nota: 'top-bar' },
  { archivo: 'src/styles/unified-bar.css', patron: /z-index:\s*var\(--z-bar\)/, nota: 'unified-bar' },
  { archivo: 'src/styles/floating.css', patron: /\.logo-menu\s*\{[^}]*z-index:\s*var\(--z-menu\)/, nota: 'menú del logo' },
  { archivo: 'src/copilot/connections/ConnectionModal.tsx', patron: /zIndex:\s*['"]var\(--z-modal\)['"]/, nota: 'ConnectionModal reclasificado a modal (tiene velo)' },
  { archivo: 'src/styles/floating.css', patron: /\.context-menu\s*\{[^}]*z-index:\s*var\(--z-context-menu\)/, nota: 'menú contextual' },
  { archivo: 'src/components/shared/SubMenu.css', patron: /z-index:\s*calc\(var\(--z-context-menu\)\s*\+\s*10\)/, nota: 'submenú del menú contextual, anidado' },
  { archivo: 'src/components/PatternEditor/CalibrationModal.css', patron: /z-index:\s*var\(--z-modal\)/, nota: 'CalibrationModal reclasificado a modal (tiene velo)' },
  { archivo: 'src/components/PatternEditor/NotchPrecisionModal.css', patron: /z-index:\s*var\(--z-menu\)/, nota: 'NotchPrecisionModal reclasificado a la baja (el propio archivo dice sin velo)' },
  { archivo: 'src/components/Debug/SolverMetrics.css', patron: /z-index:\s*var\(--z-panel\)/, nota: 'el 9999 era pánico, no necesidad real' },
  { archivo: 'src/components/shell/ToolTooltip.css', patron: /z-index:\s*var\(--z-toast\)/, nota: 'un tooltip necesita ganarle a todo' },
];

describe('los 11 sitios verificables por texto usan el token que les toca', () => {
  it.each(SITIOS_GLOBALES)('$archivo — $nota', ({ archivo, patron }) => {
    const contenido = leer(archivo);
    expect(contenido).toMatch(patron);
  });
});
```

(Faltan 2 de los 13 sitios de esta tabla: `unified-bar.css` para el aviso de soltar-DXF local a la barra y `AppShell.tsx` para el aviso global — ambos usan `var(--z-hint)` con sintaxis de `style={{}}` en TSX, que varía según cómo se escriba cada uno; se verifican a mano en el Step 3 de la Task 3, no aquí, para no sobre-especificar la forma exacta del JSX antes de escribirlo.)

- [ ] **Step 3: Correr el test y verificar que falla por la razón correcta**

```bash
npx vitest run src/styles/__tests__/zIndexScale.test.ts
```

Esperado: **FALLA** — las pruebas de orden (`--z-hint` bien definido) pasan porque el token ya existe, pero las 11 del `it.each` fallan porque ningún archivo fue tocado todavía. Confirmar que el mensaje de fallo es "no matchea el patrón", no un error de sintaxis o de import.

No se commitea todavía — el árbol queda con un test en rojo a propósito; Task 3 lo pone en verde y commitea las dos cosas juntas.

---

## Task 3: Migrar los 13 sitios del Grupo 1 (Ola 1)

**Files:**
- Modify: `src/components/shell/Dock.css:7`, `src/styles/layout.css:18`, `src/styles/unified-bar.css:5`, `src/components/shell/AppShell.tsx:240`, `src/styles/floating.css:103,180,188`, `src/copilot/connections/ConnectionModal.tsx:42`, `src/components/shared/SubMenu.css:24`, `src/components/PatternEditor/CalibrationModal.css:8`, `src/components/PatternEditor/NotchPrecisionModal.css:9`, `src/components/Debug/SolverMetrics.css:9`, `src/components/shell/ToolTooltip.css:7`

**Interfaces:**
- Consumes: `--z-dock`, `--z-panel`, `--z-bar`, `--z-menu`, `--z-hint`, `--z-context-menu`, `--z-modal`, `--z-toast` de `tokens.css` (Task 2).
- Produces: `zIndexScale.test.ts` (Task 2) en verde.

**Nota — el 14° sitio del Grupo 1 (`.context-panel`, `floating.css:35`) NO se toca aquí.** Su z-index se elimina, no se migra, y esa eliminación solo tiene sentido junto con quitarle `position:absolute` — hacerlo ahora dejaría un panel que sigue siendo overlay, pero sin z-index, tapado por cualquier cosa. Se resuelve en la Task 8 (Ola 2).

- [ ] **Step 1: Dock.css**

`src/components/shell/Dock.css:7` — dentro de la regla `.dock`, cambiar `z-index: 5;` a `z-index: var(--z-dock);`

- [ ] **Step 2: layout.css (top-bar)**

`src/styles/layout.css`, dentro de `.top-bar` (línea 18), cambiar `z-index: 10;` a `z-index: var(--z-bar);`

- [ ] **Step 3: unified-bar.css**

`src/styles/unified-bar.css:5`, dentro de `.unified-bar`, cambiar `z-index: 100;` a `z-index: var(--z-bar);`

- [ ] **Step 4: AppShell.tsx (aviso de soltar-DXF)**

`src/components/shell/AppShell.tsx:240`, dentro del `style={{...}}` del overlay de arrastre, cambiar `zIndex: 50,` a `zIndex: 'var(--z-hint)',` (React acepta un string con `var()` en `zIndex` — el navegador lo resuelve igual que en CSS puro).

- [ ] **Step 5: floating.css — menú del logo, su submenú, el menú contextual**

`src/styles/floating.css:103` (dentro de `.logo-menu`): `z-index: 200;` → `z-index: var(--z-menu);`

`src/styles/floating.css:180` (dentro de `.logo-menu__submenu`): `z-index: 210;` → `z-index: calc(var(--z-menu) + 10);`

`src/styles/floating.css:188` (dentro de `.context-menu`): `z-index: 1000;` → `z-index: var(--z-context-menu);`

- [ ] **Step 6: ConnectionModal.tsx (reclasificado a modal)**

`src/copilot/connections/ConnectionModal.tsx:42`, dentro de `overlayStyle`, cambiar `zIndex: 200,` a `zIndex: 'var(--z-modal)',`

- [ ] **Step 7: SubMenu.css (anidado sobre el menú contextual)**

`src/components/shared/SubMenu.css:24`, cambiar `z-index: 1010;` a `z-index: calc(var(--z-context-menu) + 10);`

- [ ] **Step 8: CalibrationModal.css (reclasificado a modal)**

`src/components/PatternEditor/CalibrationModal.css:8`, dentro de `.calibration-overlay`, cambiar `z-index: 1000;` a `z-index: var(--z-modal);`

- [ ] **Step 9: NotchPrecisionModal.css (reclasificado a la baja)**

`src/components/PatternEditor/NotchPrecisionModal.css:9`, cambiar `z-index: 1000;` a `z-index: var(--z-menu);`

- [ ] **Step 10: SolverMetrics.css**

`src/components/Debug/SolverMetrics.css:9`, cambiar `z-index: 9999;` a `z-index: var(--z-panel);`

- [ ] **Step 11: ToolTooltip.css**

`src/components/shell/ToolTooltip.css:7`, cambiar `z-index: 10000;` a `z-index: var(--z-toast);`

- [ ] **Step 12: Verificar el test en verde**

```bash
npx vitest run src/styles/__tests__/zIndexScale.test.ts
```

Esperado: **13 passed** (las 11 del `it.each` + las 2 de orden/existencia).

- [ ] **Step 13: Verificar el trinquete — 13 sitios menos en R8, cero sitios nuevos**

```bash
node scripts/ui-contract-lint.mjs
```

Esperado: `R8 z-index literal` bajó de 41 a 28 (41 − 13). Ningún contador subió.

- [ ] **Step 14: Commit**

```bash
git add src/styles/tokens.css src/styles/__tests__/zIndexScale.test.ts \
  src/components/shell/Dock.css src/styles/layout.css src/styles/unified-bar.css \
  src/components/shell/AppShell.tsx src/styles/floating.css \
  src/copilot/connections/ConnectionModal.tsx src/components/shared/SubMenu.css \
  src/components/PatternEditor/CalibrationModal.css src/components/PatternEditor/NotchPrecisionModal.css \
  src/components/Debug/SolverMetrics.css src/components/shell/ToolTooltip.css
git commit -m "feat(ui): migrar 13 z-index globales a la escala con nombre"
```

---

## Task 4: Aislamiento local — Grupo 2 (26 sitios, 18 archivos)

**Files:**
- Modify: `src/components/Viewport3D/FitMapToggle.tsx`, `src/components/Viewport3D/PanCrosshair.tsx`, `src/components/Viewport3D/SelectionOverlay.tsx`, `src/components/Viewport3D/SimulationStatusOverlay.tsx`, `src/components/Viewport3D/Viewport3D.tsx`, `src/components/PatternEditor/FloatingActionBar.tsx`, `src/components/BottomPanel/BOMTab.css`, `src/components/BottomPanel/GradingTab.css`, `src/components/LayerPanel/LayerPanel.css`, `src/components/PatternEditor/CalibrationModal.css`, `src/components/PatternEditor/EmptyState2D.css`, `src/components/Viewport3D/AvatarPanel.css`, `src/components/Viewport3D/CollisionBodyPanel.css`, `src/components/Viewport3D/RenderSettingsPanel.css`, `src/components/Viewport3D/SnapshotBar.css`, `src/components/Viewport3D/SurfaceModePill.css`, `src/components/shell/RightDock.tsx`, `src/components/shell/UnifiedBar.tsx`
- Create: `src/styles/__tests__/isolationBoundaries.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `isolation: isolate` en el selector raíz de cada uno de los 18 archivos; los valores 1-90 de cada archivo pasan de literal a una variable CSS local a ese mismo selector.

**Por qué un solo Task para 18 archivos:** cada cambio es del mismo tipo (agregar `isolation: isolate` + convertir un literal pequeño a variable local) y la verificación es la misma para los 26 sitios — `ui-contract-lint.mjs` cuenta que no quede ningún literal, y el test nuevo cuenta que la isla exista. Partirlo en 18 tareas sería ceremonia sin beneficio: ningún revisor rechazaría "aislar FitMapToggle" mientras aprueba "aislar PanCrosshair" — son la misma decisión, repetida.

- [ ] **Step 1: Escribir el test de aislamiento (falla porque ningún archivo lo tiene todavía)**

Crear `src/styles/__tests__/isolationBoundaries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Grupo 2 de la ley de emplazamiento (§ 2.3 de la spec de Fase 3+4): 26 sitios
 * de z-index son orden interno de un solo componente, no compiten con el
 * resto de la app. Solo lo parecía porque isolation:isolate no se usaba en
 * NINGÚN lado del proyecto (medido en la auditoría del 2026-08-14: 0
 * ocurrencias). Este test prueba que cada componente de esta lista SÍ aísla
 * su propio subárbol.
 */
function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), 'utf8');
}

const ARCHIVOS_CSS = [
  'src/components/BottomPanel/BOMTab.css',
  'src/components/BottomPanel/GradingTab.css',
  'src/components/LayerPanel/LayerPanel.css',
  'src/components/PatternEditor/CalibrationModal.css',
  'src/components/PatternEditor/EmptyState2D.css',
  'src/components/Viewport3D/AvatarPanel.css',
  'src/components/Viewport3D/CollisionBodyPanel.css',
  'src/components/Viewport3D/RenderSettingsPanel.css',
  'src/components/Viewport3D/SnapshotBar.css',
  'src/components/Viewport3D/SurfaceModePill.css',
];

describe('Grupo 2 — aislamiento en los archivos .css', () => {
  it.each(ARCHIVOS_CSS)('%s declara isolation: isolate', (ruta) => {
    expect(/isolation:\s*isolate/.test(leer(ruta))).toBe(true);
  });
});

const ARCHIVOS_TSX = [
  'src/components/Viewport3D/FitMapToggle.tsx',
  'src/components/Viewport3D/PanCrosshair.tsx',
  'src/components/Viewport3D/SelectionOverlay.tsx',
  'src/components/Viewport3D/SimulationStatusOverlay.tsx',
  'src/components/Viewport3D/Viewport3D.tsx',
  'src/components/PatternEditor/FloatingActionBar.tsx',
  'src/components/shell/RightDock.tsx',
  'src/components/shell/UnifiedBar.tsx',
];

describe('Grupo 2 — aislamiento en los archivos .tsx', () => {
  it.each(ARCHIVOS_TSX)('%s declara isolation en algún style inline', (ruta) => {
    expect(/isolation:\s*['"]isolate['"]/.test(leer(ruta))).toBe(true);
  });
});

describe('ningún literal pequeño queda suelto donde ya se aisló', () => {
  it.each([...ARCHIVOS_CSS, ...ARCHIVOS_TSX])('%s no tiene z-index literal', (ruta) => {
    const sinComentarios = leer(ruta).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(sinComentarios).not.toMatch(/z-index:\s*-?\d/);
    expect(sinComentarios).not.toMatch(/zIndex:\s*-?\d/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/styles/__tests__/isolationBoundaries.test.ts
```

Esperado: **FALLA** — ningún archivo tiene `isolation: isolate` todavía, y todos siguen con literales.

- [ ] **Step 3: Aislar y convertir cada archivo `.css` (patrón repetido, 10 archivos)**

Para cada uno de `BOMTab.css`, `GradingTab.css`, `LayerPanel.css`, `CalibrationModal.css`, `EmptyState2D.css`, `AvatarPanel.css`, `CollisionBodyPanel.css`, `RenderSettingsPanel.css`, `SnapshotBar.css`, `SurfaceModePill.css`:

1. Localizar el selector raíz del componente (la clase de más afuera que ya existe en el archivo — p. ej. `.bom-tab`, `.grading-tab`, `.layer-panel`, `.calibration-overlay`, `.empty-state-2d`, `.avatar-panel`, `.collision-body-panel`, `.render-settings-panel`, `.snapshot-bar`, `.surface-mode-pill`).
2. Agregarle `isolation: isolate;`.
3. Por cada `z-index: N;` literal en el archivo, reemplazarlo por `z-index: var(--capa-<nombre-descriptivo>);` y declarar `--capa-<nombre-descriptivo>: N;` dentro de la misma regla raíz (o donde ya vivía el literal, si el selector raíz no es ancestro directo — lo que importa es que la variable quede definida dentro del árbol que `isolation: isolate` ya cubre).

Ejemplo concreto, `SurfaceModePill.css` (dos z-index: línea 8 y línea 42, valores 25 y 30):

```css
.surface-mode-pill {
  isolation: isolate;
  --capa-pill: 1;
  --capa-menu: 2;
  /* ...reglas existentes... */
}
```
y las dos líneas de z-index pasan de `z-index: 25;` / `z-index: 30;` a `z-index: var(--capa-pill);` / `z-index: var(--capa-menu);` — los números locales (1, 2) son arbitrarios y solo importan entre sí, dentro de ese archivo.

- [ ] **Step 4: Aislar cada archivo `.tsx` (patrón repetido, 8 archivos)**

Para cada uno de `FitMapToggle.tsx`, `PanCrosshair.tsx`, `SelectionOverlay.tsx`, `SimulationStatusOverlay.tsx`, `Viewport3D.tsx`, `FloatingActionBar.tsx`, `RightDock.tsx`, `UnifiedBar.tsx`:

1. Localizar el `style={{...}}` del contenedor raíz del overlay/control.
2. Agregarle `isolation: 'isolate',`.
3. Los `zIndex: N,` internos de ese mismo árbol pueden quedarse como literales pequeños (1-90) siempre que estén dentro del subárbol ya aislado en el paso 2 — el test del Step 1 exige que no quede un `zIndex: N` FUERA de una declaración `isolation`.

**Caso especial `RightDock.tsx`/`UnifiedBar.tsx`:** antes de decidir dónde poner el `isolation`, correr `grep -n "floating-3d" src/styles/floating.css` y `grep -n "dxfDragActive" src/components/shell/UnifiedBar.tsx` para confirmar si el z-index de cada uno vive en CSS o en TSX, y ajustar el archivo/lista del test si hace falta.

- [ ] **Step 5: Verificar GREEN**

```bash
npx vitest run src/styles/__tests__/isolationBoundaries.test.ts
```

- [ ] **Step 6: Verificar el trinquete**

```bash
node scripts/ui-contract-lint.mjs
```

Esperado: `R8 z-index literal` baja de 28 a 2 (queda `.canvas-area__divider`, Task 5, y `.context-panel`, Ola 2).

- [ ] **Step 7: Commit**

```bash
git add src/components/Viewport3D/ src/components/BottomPanel/BOMTab.css src/components/BottomPanel/GradingTab.css \
  src/components/LayerPanel/LayerPanel.css src/components/PatternEditor/CalibrationModal.css \
  src/components/PatternEditor/EmptyState2D.css src/components/PatternEditor/FloatingActionBar.tsx \
  src/components/shell/RightDock.tsx src/components/shell/UnifiedBar.tsx \
  src/styles/__tests__/isolationBoundaries.test.ts
git commit -m "feat(ui): aislar 18 componentes — sus z-index dejan de competir globalmente"
```

---

## Task 5: `.canvas-area` como límite de aislamiento + el divisor

**Files:**
- Modify: `src/styles/layout.css`
- Modify: `src/styles/__tests__/isolationBoundaries.test.ts`

- [ ] **Step 1: Ampliar el test con el caso de `.canvas-area`**

Agregar a `src/styles/__tests__/isolationBoundaries.test.ts`:

```ts
describe('.canvas-area aísla el divisor', () => {
  it('.canvas-area declara isolation: isolate', () => {
    const css = leer('src/styles/layout.css');
    expect(css).toMatch(/\.canvas-area\s*\{[^}]*isolation:\s*isolate/);
  });

  it('.canvas-area__divider no tiene z-index literal', () => {
    const css = leer('src/styles/layout.css');
    const seccionDivider = css.match(/\.canvas-area__divider\s*\{[^}]*\}/)?.[0] ?? '';
    expect(seccionDivider).not.toMatch(/z-index:\s*-?\d/);
  });
});
```

- [ ] **Step 2: Verificar RED**

```bash
npx vitest run src/styles/__tests__/isolationBoundaries.test.ts -t "canvas-area"
```

Esperado: FALLA — `.canvas-area` no tiene `isolation` todavía, `.canvas-area__divider` sigue en `z-index: 5`.

- [ ] **Step 3: Editar `layout.css`**

En `.canvas-area` (línea 30-35), agregar dentro de la regla:
```css
  isolation: isolate;
  --capa-divisor: 1;
```

En `.canvas-area__divider` (línea 47), cambiar `z-index: 5;` a `z-index: var(--capa-divisor);`

- [ ] **Step 4: Verificar GREEN**

```bash
npx vitest run src/styles/__tests__/isolationBoundaries.test.ts
```

- [ ] **Step 5: Verificar el trinquete — R8 debe quedar en 1 (solo `.context-panel`)**

```bash
node scripts/ui-contract-lint.mjs
```

Esperado: `R8 z-index literal` = 1.

- [ ] **Step 6: Commit**

```bash
git add src/styles/layout.css src/styles/__tests__/isolationBoundaries.test.ts
git commit -m "feat(ui): aislar canvas-area — el divisor deja de necesitar un rol global"
```

---

## Task 6: Cierre de la Ola 1 — suite completa + baseline

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Typecheck**

```bash
npx tsc -b --noEmit
```

- [ ] **Step 2: Suite completa**

```bash
npx vitest run
```

Esperado: todos verdes, cero regresiones en el resto del proyecto.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

- [ ] **Step 4: Bajar el techo del trinquete**

```bash
node scripts/ui-contract-lint.mjs --update
```

Esperado: `zIndexLiteral` baja de 41 a 1 en `scripts/ui-contract-baseline.json`. Ninguna otra regla cambia.

- [ ] **Step 5: Commit del baseline**

```bash
git add scripts/ui-contract-baseline.json
git commit -m "chore: bajar el techo del trinquete — z-index literal 41 -> 1"
```

- [ ] **Step 6: PR de la Ola 1**

Rama nueva desde `main` con estos commits, PR con el resumen de la Ola 1 (mecánica, sin cambio visual — la prueba es que `npx vitest run` y `ui-contract-lint.mjs` quedan verdes). Mergear antes de arrancar la Ola 2.

---

# PARTE 2 — OLA 2: canaletas y modelo de paneles

**Precondición:** la Ola 1 está mergeada en `main`. Todas las tareas de esta parte parten de ese estado.

## Task 7: `usePanelHost` — el hook de dos ranuras

**Files:**
- Create: `src/hooks/usePanelHost.ts`
- Create: `src/hooks/__tests__/usePanelHost.test.ts`

**Interfaces:**
- Consumes: `getPanelSide` de `src/components/shell/panelSide.ts` (sin cambios: `LEFT_PANELS = new Set(['Grading', 'Properties'])`, todo lo demás es `'right'`).
- Produces:
```ts
interface PanelHost {
  leftPanel: string | null;
  rightPanel: string | null;
  openPanel: (name: string) => void;
  togglePanel: (name: string) => void;
  closePanel: (name: string) => void;
}
function usePanelHost(): PanelHost;
```
Task 9 (`AppShell.tsx`) consume este hook directo.

- [ ] **Step 1: Escribir el test (falla — el hook no existe)**

Crear `src/hooks/__tests__/usePanelHost.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelHost } from '../usePanelHost';

describe('usePanelHost', () => {
  it('arranca con las dos ranuras vacías', () => {
    const { result } = renderHook(() => usePanelHost());
    expect(result.current.leftPanel).toBeNull();
    expect(result.current.rightPanel).toBeNull();
  });

  it('openPanel enruta un panel derecho a rightPanel', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('BOM'));
    expect(result.current.rightPanel).toBe('BOM');
    expect(result.current.leftPanel).toBeNull();
  });

  it('openPanel enruta un panel izquierdo a leftPanel', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    expect(result.current.leftPanel).toBe('Properties');
    expect(result.current.rightPanel).toBeNull();
  });

  it('openPanel nunca cierra: abrir el mismo panel dos veces lo deja abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.leftPanel).toBe('Properties');
  });

  it('openPanel de un panel izquierdo no toca el derecho ya abierto — la esencia del caso medido', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Layers')); // derecho
    act(() => result.current.openPanel('Properties')); // izquierdo
    expect(result.current.rightPanel).toBe('Layers');
    expect(result.current.leftPanel).toBe('Properties');
  });

  it('togglePanel abre si estaba cerrado', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    expect(result.current.rightPanel).toBe('Avatar');
  });

  it('togglePanel cierra si era el mismo panel ya abierto de ese lado', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    act(() => result.current.togglePanel('Avatar'));
    expect(result.current.rightPanel).toBeNull();
  });

  it('togglePanel de un panel distinto en el mismo lado reemplaza al que estaba', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    act(() => result.current.togglePanel('BOM'));
    expect(result.current.rightPanel).toBe('BOM');
  });

  it('closePanel cierra si es el panel abierto de ese lado', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closePanel('Properties'));
    expect(result.current.leftPanel).toBeNull();
  });

  it('closePanel no hace nada si el panel nombrado no es el que está abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closePanel('Grading')); // mismo lado, otro panel
    expect(result.current.leftPanel).toBe('Properties');
  });
});
```

- [ ] **Step 2: Verificar RED**

```bash
npx vitest run src/hooks/__tests__/usePanelHost.test.ts
```

Esperado: FALLA con "Cannot find module '../usePanelHost'".

- [ ] **Step 3: Implementar el hook**

Crear `src/hooks/usePanelHost.ts`:

```ts
import { useCallback, useState } from 'react';
import { getPanelSide } from '../components/shell/panelSide';

export interface PanelHost {
  leftPanel: string | null;
  rightPanel: string | null;
  openPanel: (name: string) => void;
  togglePanel: (name: string) => void;
  closePanel: (name: string) => void;
}

/**
 * Dos ranuras independientes (izquierda/derecha) en vez de una sola
 * mutuamente excluyente. Resuelve el caso medido en la auditoría del
 * 2026-08-14: Capas (derecha) y Propiedades (izquierda) pueden convivir.
 *
 * Dos operaciones, no una, porque tienen intención distinta:
 * - openPanel: GARANTIZA abierto. La usa la selección en el lienzo
 *   (PatternEditor) — seleccionar un borde y luego otro no debe cerrar
 *   Propiedades a mitad de una edición.
 * - togglePanel: abre si cerrado, cierra si abierto. La usan los botones
 *   (docks, LogoMenu, paleta de comandos) — el comportamiento de hoy.
 */
export function usePanelHost(): PanelHost {
  const [leftPanel, setLeftPanel] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<string | null>(null);

  const openPanel = useCallback((name: string) => {
    if (getPanelSide(name) === 'left') setLeftPanel(name);
    else setRightPanel(name);
  }, []);

  const togglePanel = useCallback((name: string) => {
    if (getPanelSide(name) === 'left') {
      setLeftPanel((prev) => (prev === name ? null : name));
    } else {
      setRightPanel((prev) => (prev === name ? null : name));
    }
  }, []);

  const closePanel = useCallback((name: string) => {
    if (getPanelSide(name) === 'left') {
      setLeftPanel((prev) => (prev === name ? null : prev));
    } else {
      setRightPanel((prev) => (prev === name ? null : prev));
    }
  }, []);

  return { leftPanel, rightPanel, openPanel, togglePanel, closePanel };
}
```

- [ ] **Step 4: Verificar GREEN**

```bash
npx vitest run src/hooks/__tests__/usePanelHost.test.ts
```

Esperado: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePanelHost.ts src/hooks/__tests__/usePanelHost.test.ts
git commit -m "feat(shell): usePanelHost — dos ranuras de panel, openPanel vs togglePanel"
```

---

## Task 8: `ContextPanel` — de tarjeta flotante a hijo flex

**Files:**
- Modify: `src/components/shell/ContextPanel.tsx`
- Modify: `src/styles/floating.css`
- Create: `src/components/shell/__tests__/ContextPanel.canaleta.test.tsx`

**Interfaces:**
- Consumes: nada de las tareas anteriores directamente — este componente ya recibe `onClose` como prop, la firma no cambia.
- Produces: `ContextPanel` renderizado sin `position: absolute` ni `z-index` propios.

- [ ] **Step 1: Escribir el test (falla — el CSS todavía tiene position:absolute)**

Crear `src/components/shell/__tests__/ContextPanel.canaleta.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ContextPanel deja de flotar sobre el lienzo y pasa a ser un hijo flex real
 * (§ 2.1 de la spec de Fase 3+4). Consecuencia menos obvia, verificada aquí:
 * z-index solo aplica a elementos posicionados — al dejar de ser
 * position:absolute, su z-index deja de hacer nada, así que se ELIMINA (no
 * se migra a un token).
 */
function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), 'utf8');
}

describe('.context-panel es un hijo flex, no un overlay', () => {
  const css = leer('src/styles/floating.css');
  const regla = css.match(/\.context-panel\s*\{[^}]*\}/)?.[0] ?? '';

  it('ya no declara position: absolute', () => {
    expect(regla).not.toMatch(/position:\s*absolute/);
  });

  it('ya no declara z-index — dejó de servir para nada', () => {
    expect(regla).not.toMatch(/z-index/);
  });

  it('tiene un ancho fijo que no crece ni encoge', () => {
    expect(regla).toMatch(/flex:\s*0\s+0\s+300px/);
  });

  it('conserva el material overlay (fondo, blur, borde, sombra)', () => {
    expect(regla).toMatch(/background:\s*var\(--surface-overlay-bg\)/);
    expect(regla).toMatch(/backdrop-filter:\s*var\(--surface-overlay-blur\)/);
  });
});
```

- [ ] **Step 2: Verificar RED**

```bash
npx vitest run src/components/shell/__tests__/ContextPanel.canaleta.test.tsx
```

Esperado: FALLA en las primeras tres — `.context-panel` todavía es `position:absolute` con `z-index:25` y `width:300px` (no `flex:`).

- [ ] **Step 3: Editar `.context-panel` en `floating.css`**

Localizar la regla `.context-panel` (línea 19-31 aprox., la que empieza con `position: absolute; top: var(--sp-3); right: var(--sp-3); width: 300px;`). Reemplazar por:

```css
.context-panel {
  flex: 0 0 300px;
  max-height: calc(100vh - var(--top-bar-h) - var(--unified-bar-h) - var(--sp-8));
  background: var(--surface-overlay-bg);
  backdrop-filter: var(--surface-overlay-blur);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
  overflow-y: auto;
  margin: var(--sp-3);
  animation: slide-down var(--transition-normal) ease-out;
}
```

(`margin: var(--sp-3)` conserva la respiración visual que antes daban `top`/`right`; ahora es margen real dentro del flujo flex, no un offset de posicionamiento absoluto.)

**Nota:** si `floating.css` define variantes `.context-panel--left`/`.context-panel--right` para el offset de lado, esas reglas de offset se eliminan también — el lado ya no lo decide un offset CSS, lo decide en qué posición del flex de `canvas-area` lo monta `AppShell.tsx` (Task 9). Verificar con `grep -n "context-panel--" src/styles/floating.css` antes de tocar nada más.

- [ ] **Step 4: Verificar GREEN**

```bash
npx vitest run src/components/shell/__tests__/ContextPanel.canaleta.test.tsx
```

- [ ] **Step 5: `ContextPanel.tsx` no necesita cambios de código — solo se verifica que sigue compilando**

```bash
npx tsc -b --noEmit
```

- [ ] **Step 6: Verificar el trinquete**

```bash
node scripts/ui-contract-lint.mjs
```

Esperado: `R8 z-index literal` baja de 1 a 0.

- [ ] **Step 7: Commit**

```bash
git add src/styles/floating.css src/components/shell/__tests__/ContextPanel.canaleta.test.tsx
git commit -m "feat(shell): ContextPanel deja de flotar — hijo flex real, sin z-index"
```

---

## Task 9: `AppShell.tsx` — canaletas de panel + flex-grow del split

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Create: `src/components/shell/__tests__/AppShell.canaletas.test.tsx`

**Interfaces:**
- Consumes: `usePanelHost()` (Task 7), `ContextPanel` ya migrado (Task 8).
- Produces: `canvas-area` con hasta 5 hijos según § 2.1 de la spec; `get2dWidth`/`get3dWidth` reemplazados por valores de `flexGrow`.

**Sobre el test de esta tarea:** en vez de simular clics a través de menús anidados (frágil — un selector mal adivinado rompe el test sin que el código esté mal), se verifica **leyendo el código fuente** que cada uno de los cinco sitios pasa la función correcta — el mismo patrón ya usado en `Dock.jerarquiaDeEstado.test.ts` para CSS, aplicado aquí a TSX. Es una aserción más certera que un render completo: prueba exactamente la decisión de diseño (openPanel vs togglePanel) sin depender de la estructura interna de `LogoMenu`/`UnifiedBarCommands`, que no cambia en esta fase.

- [ ] **Step 1: Escribir el test (falla — `AppShell.tsx` todavía usa `contextPanel`/`setContextPanel`)**

Crear `src/components/shell/__tests__/AppShell.canaletas.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AppShell reemplaza la ranura única (contextPanel/setContextPanel) por
 * usePanelHost() con dos ranuras. La corrección de la spec (§ 1 de la spec
 * de Fase 3+4): la selección en el lienzo usa openPanel (garantiza abierto),
 * los botones usan togglePanel (alternan) — antes eran cuatro sitios que
 * alternaban y uno (PatternEditor.tsx:271) que no, y esa asimetría era a
 * propósito, no un bug.
 */
function leer(): string {
  return readFileSync(join(process.cwd(), 'src/components/shell/AppShell.tsx'), 'utf8');
}

describe('AppShell usa usePanelHost, no un estado de una sola ranura', () => {
  const src = leer();

  it('ya no declara contextPanel/setContextPanel', () => {
    expect(src).not.toMatch(/const \[contextPanel, setContextPanel\]/);
  });

  it('usa usePanelHost', () => {
    expect(src).toMatch(/const \{ leftPanel, rightPanel, openPanel, togglePanel, closePanel \} = usePanelHost\(\)/);
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
    expect(src).toMatch(/<RightDock[\s\S]{0,80}onOpenPanel=\{togglePanel\}/);
  });

  it('UnifiedBar recibe togglePanel', () => {
    expect(src).toMatch(/<UnifiedBar[\s\S]{0,80}onOpenPanel=\{togglePanel\}/);
  });

  it('PatternEditor recibe openPanel — NO togglePanel, la corrección de la spec', () => {
    expect(src).toMatch(/<PatternEditor[\s\S]{0,120}onOpenPanel=\{openPanel\}/);
  });
});

describe('canvas-area tiene los cinco hijos en el orden de la spec § 2.1', () => {
  const src = leer();
  // Comparación de posiciones sobre el ARCHIVO COMPLETO, no sobre un
  // "bloque" recortado — JS no hace balanced-brace matching, y recortar con
  // un regex hasta el primer </div> corta en el div del aviso de soltar-DXF
  // (que cierra mucho antes que canvas-area), no en el cierre real. Cada uno
  // de estos cuatro marcadores solo aparece una vez en el archivo, así que
  // comparar sus índices directamente sobre `src` es correcto y más simple.

  it('el panel izquierdo aparece antes de canvas-area__2d', () => {
    const idxLeft = src.indexOf('leftPanel &&');
    const idx2d = src.indexOf('canvas-area__2d');
    expect(idxLeft).toBeGreaterThan(-1);
    expect(idx2d).toBeGreaterThan(-1);
    expect(idxLeft).toBeLessThan(idx2d);
  });

  it('el panel derecho aparece después de canvas-area__3d', () => {
    const idx3d = src.indexOf('canvas-area__3d');
    const idxRight = src.indexOf('rightPanel &&');
    expect(idx3d).toBeGreaterThan(-1);
    expect(idxRight).toBeGreaterThan(-1);
    expect(idx3d).toBeLessThan(idxRight);
  });
});

describe('get2dWidth/get3dWidth se reemplazan por flexGrow', () => {
  const src = leer();

  it('ya no existen get2dWidth/get3dWidth calculando porcentaje', () => {
    expect(src).not.toMatch(/get2dWidth|get3dWidth/);
  });

  it('canvas-area__2d usa flex con el ratio del split', () => {
    expect(src).toMatch(/flex:\s*`\$\{get2dFlexGrow\(\)\}/);
  });

  it('canvas-area__3d usa flex con el ratio del split', () => {
    expect(src).toMatch(/flex:\s*`\$\{get3dFlexGrow\(\)\}/);
  });
});
```

- [ ] **Step 2: Verificar RED**

```bash
npx vitest run src/components/shell/__tests__/AppShell.canaletas.test.tsx
```

Esperado: FALLA en casi todas — `AppShell.tsx` todavía tiene `contextPanel`/`setContextPanel`, los cinco sitios todavía llaman al toggle inline viejo, y `get2dWidth`/`get3dWidth` siguen existiendo.

- [ ] **Step 3: Reemplazar el estado y el import**

Cambiar:
```tsx
const [contextPanel, setContextPanel] = useState<string | null>(null);
```
por:
```tsx
const { leftPanel, rightPanel, openPanel, togglePanel, closePanel } = usePanelHost();
```

Agregar el import (junto a los demás imports de hooks):
```tsx
import { usePanelHost } from '../../hooks/usePanelHost';
```

- [ ] **Step 4: Actualizar los cinco sitios que abren panel**

`TopBar`:
```tsx
onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)}
```
→
```tsx
onOpenPanel={togglePanel}
```

`LeftDock`:
```tsx
<LeftDock onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)} />
```
→
```tsx
<LeftDock onOpenPanel={togglePanel} />
```

`PatternEditor` — **usa `openPanel`, no `togglePanel`**, es la corrección de la spec:
```tsx
onOpenPanel={(name) => setContextPanel(name)}
```
→
```tsx
onOpenPanel={openPanel}
```

`RightDock`:
```tsx
<RightDock onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)} />
```
→
```tsx
<RightDock onOpenPanel={togglePanel} />
```

`UnifiedBar`:
```tsx
onOpenPanel={(name) => setContextPanel(prev => prev === name ? null : name)}
```
→
```tsx
onOpenPanel={togglePanel}
```

- [ ] **Step 5: Reemplazar el render del panel único por los dos hijos flex**

Cambiar:
```tsx
{contextPanel && (
  <ContextPanel title={PANEL_LABELS[contextPanel] ?? contextPanel} side={getPanelSide(contextPanel)} onClose={() => setContextPanel(null)}>
    {renderPanelContent(contextPanel)}
  </ContextPanel>
)}
```
por dos bloques — uno **antes** de `<div className="canvas-area__2d">` (izquierdo) y otro **después** del cierre de `canvas-area__3d`, como último hijo de `canvas-area` (derecho):

```tsx
{leftPanel && (
  <ContextPanel title={PANEL_LABELS[leftPanel] ?? leftPanel} onClose={() => closePanel(leftPanel)}>
    {renderPanelContent(leftPanel)}
  </ContextPanel>
)}
```

```tsx
{rightPanel && (
  <ContextPanel title={PANEL_LABELS[rightPanel] ?? rightPanel} onClose={() => closePanel(rightPanel)}>
    {renderPanelContent(rightPanel)}
  </ContextPanel>
)}
```

`ContextPanel` ya no recibe `side` — quitar esa prop de `ContextPanel.tsx` (`interface Props`) y de su JSX interno (`className={`context-panel context-panel--${side}`}` → `className="context-panel"`). Correr `grep -n "getPanelSide" src/components/shell/AppShell.tsx` — si `usePanelHost` es el único consumidor de esa función dentro de este archivo, quitar también el import de `getPanelSide` en `AppShell.tsx` (sigue usándose desde dentro de `usePanelHost.ts`, eso no cambia).

- [ ] **Step 6: Simplificar `get2dWidth`/`get3dWidth` a `flexGrow`**

Cambiar:
```tsx
const get2dWidth = () => {
  if (viewMode === '2d') return '100%';
  if (viewMode === '3d') return '0%';
  return `${splitRatio * 100}%`;
};
const get3dWidth = () => {
  if (viewMode === '3d') return '100%';
  if (viewMode === '2d') return '0%';
  return `${(1 - splitRatio) * 100}%`;
};
```
por:
```tsx
const get2dFlexGrow = () => {
  if (viewMode === '2d') return 1;
  if (viewMode === '3d') return 0;
  return splitRatio;
};
const get3dFlexGrow = () => {
  if (viewMode === '3d') return 1;
  if (viewMode === '2d') return 0;
  return 1 - splitRatio;
};
```

y sus dos usos:
```tsx
style={{ width: get2dWidth(), display: viewMode === '3d' ? 'none' : undefined }}
```
→
```tsx
style={{ flex: `${get2dFlexGrow()} 1 0px`, display: viewMode === '3d' ? 'none' : undefined }}
```
```tsx
style={{ width: get3dWidth(), display: viewMode === '2d' ? 'none' : undefined }}
```
→
```tsx
style={{ flex: `${get3dFlexGrow()} 1 0px`, display: viewMode === '2d' ? 'none' : undefined }}
```

- [ ] **Step 7: Verificar GREEN**

```bash
npx vitest run src/components/shell/__tests__/AppShell.canaletas.test.tsx
```

- [ ] **Step 8: Typecheck y suite completa**

```bash
npx tsc -b --noEmit
npx vitest run
```

Esperado: sin regresiones. Prestar atención particular a `LogoMenu.test.tsx`, `Dock.test.tsx`, `RightDock.test.tsx` (Global Constraints — no deberían necesitar cambios porque mockean `onOpenPanel` como prop genérica, pero confirmarlo aquí, no asumirlo).

- [ ] **Step 9: Commit**

```bash
git add src/components/shell/AppShell.tsx src/components/shell/ContextPanel.tsx \
  src/components/shell/__tests__/AppShell.canaletas.test.tsx
git commit -m "feat(shell): AppShell usa usePanelHost — dos ranuras, flex-grow en vez de porcentaje"
```

**Nota de alcance encontrada al escribir esta tarea:** `layout.css` nunca declaró `width` en la hoja base de `.canvas-area__2d`/`__3d` — el ancho de hoy viene solo del `style={{width:...}}` inline que el Step 6 de arriba ya reemplazó por `flex`. No hace falta una tarea aparte para "limpiar" `layout.css`; ya quedó resuelto.

---

## Task 10: `computeFitView` — descontar el ancho del dock (opcional, bajo costo)

**Files:**
- Modify: `src/components/PatternEditor/PatternEditor.tsx`
- Create: `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`

**Interfaces:**
- Consumes: `computeFitView(pieces, viewportWidth, viewportHeight, padding?)` de `src/store/editorSlice.ts:320` — firma sin cambios.
- Produces: la llamada de `PatternEditor.tsx:672` descuenta el ancho fijo del dock antes de pasar `rect.width`.

- [ ] **Step 1: Confirmar el ancho real del dock**

```bash
grep -n "width: 38px\|padding: 7px" -A1 src/components/shell/Dock.css
grep -n "dock--left" src/components/shell/Dock.css
```

El dock mide `38px` de icono + `7px` de padding a cada lado (`.dock { padding: 7px }`) + `14px` de margen desde el borde (`.dock--left { left: 14px; }`) = `14 + 7 + 38 + 7 = 66px` de faja total. Si al verlo en el navegador (Task 12) el número real medido difiere, se ajusta ahí — no se re-adivina aquí.

- [ ] **Step 2: Escribir el test (falla — la llamada de hoy no descuenta nada)**

Crear `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx`. El montaje (store, reductor, pieza) copia el patrón de `PatternEditor.seamAllowanceExactWidth.test.tsx`; el disparo del encuadre es distinto — ese archivo no toca `fitViewToken`, así que se dispara directo con `requestFitView()` de `editorSlice`, que es el mismo mecanismo que ya usa `AppShell.tsx` tras importar un DXF (`PatternEditor.tsx:679-690` escucha ese token vía `useEffect` y llama `handleZoomToFit`, que es quien llama a `computeFitView`):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import * as editorSlice from '../../../store/editorSlice';
import editorReducer, { requestFitView } from '../../../store/editorSlice';
import { restoreState } from '../../../store/projectSlice';
import projectReducer from '../../../store/projectSlice';
import toolReducer from '../../../store/toolSlice';
import simulationReducer from '../../../store/simulationSlice';
import constructionReducer from '../../../store/constructionSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';

/**
 * El dock de herramientas se queda flotando (§ 2.1 de la spec) — no reserva
 * espacio real, así que "ajustar a la vista" sigue sin saber que hay ~66px
 * de dock tapando el borde del lienzo. Como el ancho del dock es una
 * constante fija (no dinámica), se resta antes de calcular el encuadre.
 */
afterEach(cleanup);

const piece: PatternPiece = {
  id: 'p', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
  edges: [], internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 10, active: true, createdAt: 0, updatedAt: 0,
};

function montar() {
  const store = configureStore({
    reducer: {
      project: projectReducer, editor: editorReducer, tools: toolReducer,
      simulation: simulationReducer, construction: constructionReducer,
      inputScheme: inputSchemeReducer, workflow: workflowReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece] }));
  const view = render(<Provider store={store}><PatternEditor onOpenPanel={() => {}} /></Provider>);
  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  // jsdom no calcula layout: getBoundingClientRect da 0 siempre. Se mockea
  // al ancho conocido que la aserción usa más abajo.
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    width: 1000, height: 800, top: 0, left: 0, right: 1000, bottom: 800, x: 0, y: 0, toJSON() {},
  } as DOMRect);
  return { store };
}

describe('PatternEditor descuenta el ancho del dock al ajustar a la vista', () => {
  it('computeFitView recibe el ancho del contenedor menos 66px de dock', () => {
    const spy = vi.spyOn(editorSlice, 'computeFitView');
    const { store } = montar();
    store.dispatch(requestFitView());
    expect(spy).toHaveBeenCalled();
    const [, anchoRecibido] = spy.mock.calls[spy.mock.calls.length - 1];
    expect(anchoRecibido).toBe(934); // 1000 (mockeado) - 66 (faja del dock)
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Verificar RED**

```bash
npx vitest run src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx
```

Esperado: FALLA — hoy `llamada[1]` sería `1000`, no `934`.

- [ ] **Step 4: Editar la llamada en `PatternEditor.tsx:672`**

Localizar:
```tsx
const rect = svgEl.getBoundingClientRect();
const fit = computeFitView(pieces, rect.width, rect.height);
```

Cambiar a:
```tsx
// El dock de herramientas se queda flotando (no reserva espacio real, §2.1
// de la Fase 3+4), así que se descuenta a mano su faja fija — 14px de
// margen + 7px de padding + 38px de icono + 7px de padding = 66px.
const DOCK_WIDTH_PX = 66;
const rect = svgEl.getBoundingClientRect();
const fit = computeFitView(pieces, Math.max(0, rect.width - DOCK_WIDTH_PX), rect.height);
```

- [ ] **Step 5: Verificar GREEN**

```bash
npx vitest run src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx
```

- [ ] **Step 6: Suite completa del módulo — este cambio toca una función usada por otros flujos de encuadre**

```bash
npx vitest run src/components/PatternEditor
```

- [ ] **Step 7: Commit**

```bash
git add src/components/PatternEditor/PatternEditor.tsx src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx
git commit -m "fix(fit-view): descontar el ancho fijo del dock al ajustar a la vista"
```

---

## Task 11: Verificación de los 11 archivos "en riesgo" — confirmar, no editar

**Files:** ninguno se edita. Solo se corren.

- [ ] **Step 1: Los 7 archivos de test unitario**

```bash
npx vitest run \
  src/components/PatternEditor/__tests__/PatternEditor.seamAllowanceExactWidth.test.tsx \
  src/components/PropertiesPanel/__tests__/PropertiesPanel.rehome.test.tsx \
  src/components/shell/__tests__/Dock.test.tsx \
  src/components/shell/__tests__/LogoMenu.test.tsx \
  src/components/shell/__tests__/RightDock.test.tsx \
  src/components/shell/__tests__/unifiedBarCommandGroups.test.tsx \
  src/store/__tests__/renderSettingsThunk.test.ts
```

Esperado: **todos verdes, sin editar nada** — mockean `onOpenPanel` como prop genérica de los componentes hijos, cuya firma no cambió. Si alguno falla, es señal de una regresión real en Task 9 (probablemente en el wiring de los cinco sitios), no un test desactualizado — investigar ahí antes de tocar el test.

- [ ] **Step 2: Los 4 specs e2e — requieren el server de dev vivo**

```bash
npm run dev &
sleep 3
npx playwright test bundle-split.spec.ts command-palette.spec.ts ik-solver.spec.ts morph-weights.spec.ts
```

Esperado: verdes. Comprueban `.context-panel__header` (clase que Task 8 conserva) y `button[aria-label="Avatar"]` (RightDock, sin tocar).

- [ ] **Step 3: Si algo falla, documentar la causa antes de decidir el arreglo**

No hay "Step 4" de edición por defecto — si algo falla de verdad, es un hallazgo nuevo de esta tarea, se investiga con la skill de depuración sistemática antes de tocar nada, y se agrega como tarea aparte a este plan (no se improvisa un parche aquí).

---

## Task 12: Verificación en el navegador — contra el DXF real de María

**Files:** ninguno. Verificación manual con las herramientas de navegador.

- [ ] **Step 1: Cargar la app con el patrón real**

Con `npm run dev` corriendo, abrir `http://localhost:5173/`, e importar `tests/fixtures/garments/maria_patrones_samuel_2M.dxf` (inyectándolo vía `input[accept=".dxf"]`, patrón ya usado en sesiones anteriores de este mismo proyecto).

- [ ] **Step 2: Medir el ancho del SVG antes y después de abrir un panel**

```js
document.querySelector('.canvas-area__2d svg').getBoundingClientRect().width
```
Anotar el valor. Abrir Propiedades (seleccionar una pieza). Repetir la medición — debe ser **menor** que antes, en 300px (el ancho fijo del panel).

- [ ] **Step 3: Capas y Propiedades conviven**

Abrir Capas (paleta de comandos), luego seleccionar una pieza (abre Propiedades). Confirmar visualmente que **los dos** paneles están en pantalla a la vez, uno a cada lado.

- [ ] **Step 4: Modo Split no se desborda ni deja hueco**

Con Capas y Propiedades abiertos, cambiar a modo Split. Confirmar que las mitades 2D y 3D sumadas ocupan exactamente el espacio que queda entre los dos paneles — sin overlap, sin hueco en blanco.

- [ ] **Step 5: "Ajustar a la vista" encuadra bien con un panel abierto**

Con Propiedades abierto, disparar el ajuste a la vista (importar de nuevo, o el atajo correspondiente). Confirmar que el patrón se ve completo, sin quedar parcialmente detrás del panel.

- [ ] **Step 6: Docks y barra de IA sin cambios**

Confirmar visualmente que el dock 2D, el dock 3D y la barra de IA se ven y se comportan exactamente igual que en la versión desplegada antes de esta fase — arrastrar la barra de IA, confirmar que sigue funcionando.

- [ ] **Step 7: El toast sigue por encima de un modal**

Abrir `CalibrationModal` (herramienta de calibración) y disparar un toast (p. ej. una acción que muestre confirmación). Confirmar que el toast se ve por encima del modal — no debe regresar el bug que se cerró en la Fase 1.

- [ ] **Step 8: Capturas antes/después**

Guardar capturas de los pasos 2-5 como evidencia.

Si cualquiera de estos pasos falla, **no se sigue** a la Task 13 — se vuelve a la tarea de la Ola 2 responsable (Task 8, 9 o 10 según el síntoma) con la skill de depuración sistemática.

---

## Task 13: Cierre de la Ola 2 — suite completa + baseline + PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Typecheck**

```bash
npx tsc -b --noEmit
```

- [ ] **Step 2: Suite completa**

```bash
npx vitest run
```

- [ ] **Step 3: Lint**

```bash
npm run lint
```

- [ ] **Step 4: Bajar el techo del trinquete**

```bash
node scripts/ui-contract-lint.mjs --update
```

Esperado: `zIndexLiteral` baja de 1 a 0. Ningún otro contador sube.

- [ ] **Step 5: Commit del baseline**

```bash
git add scripts/ui-contract-baseline.json
git commit -m "chore: bajar el techo del trinquete — z-index literal 1 -> 0"
```

- [ ] **Step 6: PR de la Ola 2**

Rama nueva desde `main` (ya con la Ola 1 mergeada) con los commits de las Tasks 7-13. PR con el resumen de la Ola 2, citando las capturas de la Task 12 como evidencia de verificación en navegador. Mergear y desplegar con `bash scripts/deploy-prod.sh`, siguiendo la convención del repo.
});
