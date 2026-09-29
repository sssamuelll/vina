# Cromo callado — F0 y F1: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar medido lo que hay en pantalla por acción (F0: marcas `data-superficie`, trinquete e2e, capturas de producción) y cambiar la piel entera del cromo (F1: grafito tono 80, un acento 248, Inter única, mono solo para datos, materiales sin blur ni sombra en lo acoplado, escala tipográfica fija), sin tocar arquitectura ni la densidad del patrón.

**Architecture:** Toda la piel vive en `src/styles/tokens.css` y los componentes solo consumen tokens (ley § 1 del contrato). Un módulo `src/styles/colorMath.ts` convierte OKLCH → sRGB y mide contraste WCAG 2; lo usan los tests de tokens, el script `scripts/contraste-tokens.ts` y el módulo `src/styles/contrasteDeTokens.ts` (pares con piso). Dos trinquetes e2e nuevos (`superficies-por-accion`, `contraste-del-cromo`) guardan su techo en JSON como `ui-contract-baseline.json`: solo bajan. Los tokens viejos quedan como alias hasta que ningún consumidor los referencie y se retiran al final (R2 = 0 en cada commit).

**Tech Stack:** React 19 + TypeScript, CSS custom properties (OKLCH), Vitest (node + jsdom), Playwright (Chromium), scripts Node 22 (`.mjs`) y `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-24-cromo-callado-design.md` (§ 3.4 trinquete, § 4 piel, § 6 enmiendas, § 7 F0 y F1). Evidencia: `docs/reports/2026-09-24-brief-elegancia-2026.md`.

## Global Constraints

- Dos ramas: `feat/cromo-callado-f0` desde `main` (`b6c20565`; Tareas 1-4) y `feat/cromo-callado-f1` desde la F0 (Tareas 5-16). Cada una termina en un PR; el de F1 apunta a la rama F0 mientras esta no se mezcle. Las líneas citadas (`archivo:línea`) son las de `main` en `b6c20565`; si una tarea anterior las movió, se busca el texto citado.
- Typecheck siempre con `npx tsc -b --noEmit`. Nunca `--no-verify`.
- Contrato de interfaz: invocar la skill `contrato-de-interfaz` antes de la primera edición visual (Tarea 2). `node scripts/ui-contract-lint.mjs` no puede subir ningún contador en ningún commit; cuando un contador baja, `node scripts/ui-contract-lint.mjs --update` y `scripts/ui-contract-baseline.json` va en el mismo commit.
- Ley de tokens: ningún color literal fuera de `src/styles/tokens.css`; ningún `var(--x, fallback)`; al cerrar F1 un solo archivo define tokens (R4 = 1).
- Un token solo se retira cuando `grep -rn -e '--nombre' src | grep -v tokens.css` no devuelve nada. R2 = 0 en todo momento.
- Los valores de la piel son los de la sección «Valores de la piel» (calculados con `scripts/contraste-tokens.ts`), escritos tal cual: `oklch(0.60 0.16 248)` con dos decimales en L, porque `cotas-contraste.test.ts` compara la cadena.
- El papel no se toca: `--canvas-2d`, `--grid-2d*`, `--ink-*`, `--seam-pair-*`, `--piece-*-2d`, `--notch-2d`, `--snap-2d`, `--cota-*`, `--readout-*`, `--annotation-2d`, `--fold-*`, `--topstitch-2d`, `--seam-tension-*` conservan su valor. Únicas excepciones: `--accent-2d` pasa a alias de `--accent` y los puntos del contorno en reposo usan `--ink-on-light-2`.
- Copy y comentarios nuevos en español (sentence case, sin «¡» ni «por favor»).
- jsdom no calcula layout: lo que toque apilamiento (blur, opacity) se verifica en navegador con `tests/e2e/emplazamiento-*.spec.ts` (Tarea 16).
- Gates antes de cada commit de código: `npx tsc -b --noEmit`, `npx vitest run <tests tocados>`, `npx eslint <archivos tocados>`, `node scripts/ui-contract-lint.mjs`. Al cierre de cada rama: `npm run test`, `npm run lint`, `npm run lint:ui` y los e2e de la Tarea 16.
- Playwright usa `http://localhost:5174` (`npx vite --port 5174`, lo levanta o lo reutiliza). Las capturas de F0/F1 se hacen contra `vite preview` (build de producción, puerto 4174), nunca contra el dev server: `TopBar.tsx:81` y `SolverMetrics.tsx:36` solo existen en DEV.
- Los e2e que vacían campos usan `ControlOrMeta+a` (en macOS `Control+a` no selecciona, #1210).

## Valores de la piel (calculados con el script de la Tarea 7, no estimados)

| Token | Valor | Hex | Ratio que lo justifica |
|---|---|---|---|
| `--bg-deeper` | `oklch(0.13 0.004 80)` | `#080706` | |
| `--bg-base` | `oklch(0.16 0.004 80)` | `#0e0d0b` | |
| `--bg-surface` | `oklch(0.19 0.005 80)` | `#151411` | |
| `--bg-elevated` | `oklch(0.25 0.006 80)` | `#23211e` | |
| `--border` | `oklch(0.32 0.006 80)` | `#34332f` | 1,46:1 sobre surface (se ve) |
| `--border-subtle` | `oklch(0.22 0.005 80)` | `#1c1a18` | |
| `--scene-3d` | `oklch(0.26 0.004 80)` | `#252422` | consumidor: F3 |
| `--text-primary` | `oklch(0.93 0.006 80)` | `#eae7e3` | 14,95:1 surface · 13,03 elevated |
| `--text-secondary` | `oklch(0.77 0.008 80)` | `#b7b4af` | 8,91:1 · 7,77 |
| `--text-tertiary` | `oklch(0.64 0.008 80)` | `#8f8c87` | 5,50:1 · 4,79 · 5,03 sobre overlay |
| `--text-disabled` | `oklch(0.48 0.006 80)` | `#5f5d5a` | 2,81:1 (solo deshabilitado) |
| `--accent` | `oklch(0.60 0.16 248)` | `#0584da` | 3,43:1 sobre crema · 3,95 sobre pieza · 4,67 sobre surface |
| `--accent-fuerte` = `--accent-2d-fuerte` | `oklch(0.54 0.15 248)` | `#0072c0` (recortado a gama, como hoy) | blanco 5,04:1 · 4,38 sobre crema |
| `--accent-ink` | `oklch(0.76 0.11 248)` | `#77b7f4` | 8,65:1 surface · 7,54 elevated |
| `--accent-subtle` / `--accent-border` | `oklch(0.60 0.16 248 / 14%)` / `/ 30%` | | compuesto sobre surface: `#13242d`; texto primario encima 12,9:1 |
| `--ai` | `oklch(0.72 0.13 295)` | `#ab93ed` | 7,13:1 surface |
| `--success` | `oklch(0.68 0.14 150)` | `#4eb068` | 6,78:1 |
| `--warning` | `oklch(0.75 0.14 75)` | `#e1a035` | 8,14:1 |
| `--destructive` | `oklch(0.62 0.18 25)` | `#de4e4b` | 4,65:1 como texto |
| `--destructive-fuerte` | `oklch(0.52 0.18 25)` | `#ba2b2e` | blanco encima 6,05:1 (hoy `#ef4444` da 3,76) |
| `--destructive-hover` | `oklch(0.70 0.16 25)` | `#f2716a` | 6,44:1 |
| `--surface-overlay-bg` | `rgba(21, 20, 17, 0.96)` | | terciario encima 5,03:1 |
| `--hairline` | `1px solid rgba(255, 255, 255, 0.07)` | | 1,19:1 sobre surface |
| `--scrim` | `rgb(8 7 6 / 55%)` | | |

Lo que cambia respecto al spec § 4, dicho aquí para que no parezca descuido: (1) `--radius-lg` (10 px) **se conserva** porque el dock lo necesita (10 exterior = 6 del botón + 4 de padding); solo se retira `--radius-xl`. (2) Se añade `--destructive-fuerte`, hermano de `--accent-fuerte`: el botón «Eliminar» del diálogo lleva texto blanco y con `--destructive` se quedaría en 3,96:1. (3) `--hairline` nombra la línea de pelo del material overlay para que los separadores no la copien a mano.

## Review Focus

1. **Quitar el blur (24 sitios con `backdrop-filter`) y la opacidad de la barra (`unified-bar.css:25`) cambia contextos de apilamiento:** un `position: fixed` que hoy queda encerrado puede escapar, y al revés. Test: la Tarea 16 corre en navegador `emplazamiento-modales`, `emplazamiento-tira`, `emplazamiento-paneles`, `emplazamiento-lienzo-2d` y `emplazamiento-imagenes-de-referencia`.
2. **`oklch()` con alfa (`/ 14%`) y `color-mix()` en Chrome:** si el navegador no los parsea, el relleno del dock activo y la marquesina de selección quedan transparentes sin error. Test: `contraste-del-cromo.spec.ts` (Tarea 14) afirma que el fondo computado de `.dock__tool--active` no es transparente y que `--accent-subtle` compone sobre el cromo.
3. **Los puntos del contorno siguen visibles en reposo (#1103) al pasar a tinta:** cambiar el color no puede esconderlos. Test: `PuntosDelContorno.tinta.test.tsx` (Tarea 12) cuenta cuatro glifos en una pieza no elegida y exige `fill="var(--ink-on-light-2)"`.
4. **El dock cambia de ancho (54 → 48 px) y `computeFitView` descuenta `DOCK_WIDTH_PX`:** si el CSS y la constante divergen, el encuadre tapa o desperdicia píxeles. Test: `superficies-por-accion.spec.ts` (Tarea 3) mide `.dock--left` en navegador contra un espejo de `DOCK_WIDTH_PX`, escrito en F0 con 68; la Tarea 9 lo baja a 62 junto con la constante.
5. **Sin Inter 700 en `index.html`, todo `font-weight: 700` se sintetiza** (negrita falsa, borrosa a 11 px). Test: `tipografia-del-cromo.test.ts` (Tarea 8) falla si queda un `700` en `src/styles/` o en el CSS y TSX de `src/components/shell/`.

---

## F0 — Medir antes de tocar

### Tarea 1: Rama F0 y documentos

**Files:**
- Commit (ya existen, sin commitear): `docs/superpowers/specs/2026-09-24-cromo-callado-design.md`, `docs/reports/2026-09-24-brief-elegancia-2026.md`, `docs/superpowers/plans/2026-09-26-cromo-callado-f0-f1.md`

- [ ] **Paso 1: Crear la rama**

```bash
git switch -c feat/cromo-callado-f0 main
git status --short   # solo los tres documentos como untracked
```

- [ ] **Paso 2: Commit de los documentos**

```bash
git add docs/superpowers/specs/2026-09-24-cromo-callado-design.md docs/reports/2026-09-24-brief-elegancia-2026.md docs/superpowers/plans/2026-09-26-cromo-callado-f0-f1.md
git commit -m "docs(ui): spec «cromo callado», brief de elegancia 2026 y plan F0+F1"
```

### Tarea 2: Marcas `data-superficie` en la raíz de cada superficie

Cada superficie del shell declara qué es (spec § 3.4). El vocabulario es cerrado: `ambiente`, `documento`, `dev` (no cuentan) y `tira`, `fila`, `pista`, `barra`, `paleta`, `velo`, `cabina`, `menu`, `panel`, `modal`, `toast`, `tooltip`, `estado-vacio`, `indicador-simulacion`, `indicador-fps`, `mapas`, `instantaneas`.

**Files:**
- Create: `tests/repo/superficies-declaradas.test.ts`
- Modify (una línea cada uno; se añade el atributo al elemento indicado):
  - `src/components/shell/TopBar.tsx:39` `.top-bar` → `ambiente`; `:82` `.top-bar__status` → `dev`
  - `src/components/shell/DockShell.tsx:17` `.dock` → `ambiente`
  - `src/components/PatternEditor/renderers/RulerLayer.tsx:39` `<g className="ruler-layer">` → `documento`
  - `src/components/Viewport3D/SurfaceModePill.tsx:68` `.surface-pill` → `ambiente`; `:78` `.surface-pill__flyout` → `menu`
  - `src/components/Debug/SolverMetrics.tsx:53` (botón `.solver-metrics-toggle`) y `:62` (`.solver-metrics-body`) → `dev`
  - `src/components/PatternEditor/ToolStrip2D.tsx:100` → `tira`
  - `src/components/PatternEditor/FilaDeCapas.tsx:39` → `fila`
  - `src/components/PatternEditor/renderers/HintText.tsx:76` (el `<text` de `Pie`) y `:163` (la bienvenida) → `pista`
  - `src/components/shell/UnifiedBar.tsx:207` (`<div ref={barRef} className={barClasses}`) → `barra`; `:219` (velo de arrastre) → `velo`; `:279` `.unified-bar__panel` → `paleta`
  - `src/components/PatternEditor/FloatingActionBar.tsx:66` → `cabina`
  - `src/components/PatternEditor/cotas/CotaChip.tsx:291`, `:303`, `:328` → `cabina`
  - `src/components/PatternEditor/cotas/CotasLayer.tsx:134`, `:143` (lecturas) → `cabina`
  - `src/components/PatternEditor/renderers/overlays/TransformHandlesOverlay.tsx:45` `<g className="transform-handles">` → `cabina`
  - `src/components/shell/LogoMenu.tsx:443` `.logo-menu` → `menu`; `src/components/PatternEditor/ContextMenu.tsx:188` → `menu`; `src/components/Viewport3D/ContextMenu3D.tsx:265-268` (el `<div ref={ref} className="context-menu context-menu--scroll"`) → `menu`; `src/components/shell/DockToolPicker.tsx:21` → `menu`; `src/components/LayerPanel/LayerPanel.tsx:397` `.layer-context-menu` → `menu`
  - `src/components/shell/ContextPanel.tsx:26` → `panel`; `src/components/Viewport3D/RenderSettingsPanel.tsx:34` → `panel`; `src/components/Viewport3D/CollisionBodyPanel.tsx:60` `.cb-panel-wrapper` → `panel`; `src/components/Viewport3D/FitMapToggle.tsx:331` `<div style={S.configPanel}>` → `panel`
  - `src/components/PatternEditor/NotchPrecisionModal.tsx:67` → `modal`; `src/components/shell/ConfirmDialog.tsx:78` → `modal`; `src/components/PatternEditor/CalibrationModal.tsx:32` → `modal`; `src/copilot/connections/ConnectionModal.tsx:179` (el `<div style={overlayStyle}` que porta `createPortal`) → `modal`
  - `src/components/shell/ToastContainer.tsx:43` `.toast` → `toast`
  - `src/components/shell/ToolTooltip.tsx:63` `.tool-tooltip` → `tooltip`
  - `src/components/shell/AppShell.tsx:291` (el `<div` que sigue a `dxfDragActive && (`) → `velo`
  - `src/components/PatternEditor/EmptyState2D.tsx:25` → `estado-vacio`
  - `src/components/Viewport3D/SimulationStatusOverlay.tsx:77` (el `<div style={{ position: 'absolute', top: 8, left: 8 …`) → `indicador-simulacion`; `src/components/shell/RightDock.tsx:120` `.floating-3d--bottom-left` → `indicador-fps`
  - `src/components/Viewport3D/FitMapToggle.tsx:266` `<div style={S.toggleBar}>` → `mapas`
  - `src/components/Viewport3D/SnapshotBar.tsx:59` → `instantaneas`

**Interfaces:**
- Produces: el atributo `data-superficie="<valor>"` en el DOM; lo consume `tests/e2e/helpers/superficies.ts` (Tarea 3) y `scripts/capturas-ui.mjs` (Tarea 4).

- [ ] **Paso 0: Invocar la skill `contrato-de-interfaz`** (es la primera edición de interfaz de la rama).

- [ ] **Paso 1: Escribir el test que falla**

`tests/repo/superficies-declaradas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cada superficie del shell declara qué es con `data-superficie` (spec
 * 2026-09-24 «cromo callado» § 3.4). El trinquete e2e de superficies por
 * acción cuenta SOLO lo que está marcado: una superficie sin marca es
 * invisible para el techo de 4, así que este test pide la marca archivo por
 * archivo, con el valor y las veces exactas. Si nace una superficie nueva,
 * se añade aquí y al vocabulario.
 */
export const VOCABULARIO = new Set([
  'ambiente', 'documento', 'dev',
  'tira', 'fila', 'pista', 'barra', 'paleta', 'velo', 'cabina', 'menu', 'panel',
  'modal', 'toast', 'tooltip', 'estado-vacio', 'indicador-simulacion',
  'indicador-fps', 'mapas', 'instantaneas',
]);

/** [archivo, valor, veces] */
const MARCAS: Array<[string, string, number]> = [
  ['src/components/shell/TopBar.tsx', 'ambiente', 1],
  ['src/components/shell/TopBar.tsx', 'dev', 1],
  ['src/components/shell/DockShell.tsx', 'ambiente', 1],
  ['src/components/PatternEditor/renderers/RulerLayer.tsx', 'documento', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'ambiente', 1],
  ['src/components/Viewport3D/SurfaceModePill.tsx', 'menu', 1],
  ['src/components/Debug/SolverMetrics.tsx', 'dev', 2],
  ['src/components/PatternEditor/ToolStrip2D.tsx', 'tira', 1],
  ['src/components/PatternEditor/FilaDeCapas.tsx', 'fila', 1],
  ['src/components/PatternEditor/renderers/HintText.tsx', 'pista', 2],
  ['src/components/shell/UnifiedBar.tsx', 'barra', 1],
  ['src/components/shell/UnifiedBar.tsx', 'velo', 1],
  ['src/components/shell/UnifiedBar.tsx', 'paleta', 1],
  ['src/components/PatternEditor/FloatingActionBar.tsx', 'cabina', 1],
  ['src/components/PatternEditor/cotas/CotaChip.tsx', 'cabina', 3],
  ['src/components/PatternEditor/cotas/CotasLayer.tsx', 'cabina', 2],
  ['src/components/PatternEditor/renderers/overlays/TransformHandlesOverlay.tsx', 'cabina', 1],
  ['src/components/shell/LogoMenu.tsx', 'menu', 1],
  ['src/components/PatternEditor/ContextMenu.tsx', 'menu', 1],
  ['src/components/Viewport3D/ContextMenu3D.tsx', 'menu', 1],
  ['src/components/shell/DockToolPicker.tsx', 'menu', 1],
  ['src/components/LayerPanel/LayerPanel.tsx', 'menu', 1],
  ['src/components/shell/ContextPanel.tsx', 'panel', 1],
  ['src/components/Viewport3D/RenderSettingsPanel.tsx', 'panel', 1],
  ['src/components/Viewport3D/CollisionBodyPanel.tsx', 'panel', 1],
  ['src/components/Viewport3D/FitMapToggle.tsx', 'panel', 1],
  ['src/components/Viewport3D/FitMapToggle.tsx', 'mapas', 1],
  ['src/components/PatternEditor/NotchPrecisionModal.tsx', 'modal', 1],
  ['src/components/shell/ConfirmDialog.tsx', 'modal', 1],
  ['src/components/PatternEditor/CalibrationModal.tsx', 'modal', 1],
  ['src/copilot/connections/ConnectionModal.tsx', 'modal', 1],
  ['src/components/shell/ToastContainer.tsx', 'toast', 1],
  ['src/components/shell/ToolTooltip.tsx', 'tooltip', 1],
  ['src/components/shell/AppShell.tsx', 'velo', 1],
  ['src/components/PatternEditor/EmptyState2D.tsx', 'estado-vacio', 1],
  ['src/components/Viewport3D/SimulationStatusOverlay.tsx', 'indicador-simulacion', 1],
  ['src/components/shell/RightDock.tsx', 'indicador-fps', 1],
  ['src/components/Viewport3D/SnapshotBar.tsx', 'instantaneas', 1],
];

const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('cada superficie del shell declara data-superficie', () => {
  it.each(MARCAS)('%s declara "%s" %i vez/veces', (ruta, valor, veces) => {
    const n = lee(ruta).match(new RegExp(`data-superficie="${valor}"`, 'g'))?.length ?? 0;
    expect(n, `${ruta}: esperaba data-superficie="${valor}" ${veces} vez/veces`).toBe(veces);
  });

  it('ningún archivo usa un valor fuera del vocabulario', () => {
    const fuera: string[] = [];
    for (const ruta of new Set(MARCAS.map(([r]) => r))) {
      for (const m of lee(ruta).matchAll(/data-superficie="([^"]+)"/g)) {
        if (!VOCABULARIO.has(m[1])) fuera.push(`${ruta}: ${m[1]}`);
      }
    }
    expect(fuera).toEqual([]);
  });
});
```

- [ ] **Paso 2: Verlo fallar**

```bash
npx vitest run tests/repo/superficies-declaradas.test.ts
```
Esperado: FAIL en las 38 filas de `MARCAS` («esperaba data-superficie=… 1 vez»).

- [ ] **Paso 3: Añadir el atributo en cada raíz de la lista de arriba**

Ejemplo del patrón (mismo para todos; en JSX el atributo va tal cual):

```tsx
// ToolStrip2D.tsx:100 — antes
<div className="tool-strip" role="group" aria-label="Herramienta activa" ref={raiz}>
// después
<div className="tool-strip" role="group" aria-label="Herramienta activa" ref={raiz} data-superficie="tira">
```

Para `HintText.tsx:76` el atributo va en el `<text` de `Pie` (`<text data-superficie="pista" x="50%" y="98%" …`) y en `:163` en el `<text` de bienvenida. Para `UnifiedBar.tsx:207` va en el `<div ref={barRef} className={barClasses}`. Para `ConnectionModal.tsx:179` en el `<div style={overlayStyle}` que devuelve `createPortal`.

- [ ] **Paso 4: Correr el test y las suites de los componentes tocados; actualizar snapshots si SOLO cambió el atributo**

```bash
npx vitest run tests/repo/superficies-declaradas.test.ts
npx vitest run src/components/PatternEditor src/components/shell src/components/Viewport3D src/components/LayerPanel src/copilot
```
Si un snapshot falla y el diff es únicamente el atributo `data-superficie`, `npx vitest run <ese archivo> -u` y revisar el `.snap` en el diff antes de commitear.

- [ ] **Paso 5: Gates y commit**

```bash
npx tsc -b --noEmit && npx eslint $(git diff --name-only | grep -E '\.tsx?$') && node scripts/ui-contract-lint.mjs
git add -A && git commit -m "feat(ui): cada superficie del shell declara data-superficie (F0, spec § 3.4)"
```

### Tarea 3: Trinquete e2e de superficies por acción

**Files:**
- Create: `tests/e2e/helpers/trinquete.ts` (línea base JSON compartida por los dos trinquetes)
- Create: `tests/e2e/helpers/superficies.ts` (qué está visible, qué apareció o cambió)
- Create: `tests/e2e/helpers/estados.ts` (cómo se llega a cada estado con el patrón de María)
- Create: `tests/e2e/superficies-por-accion.spec.ts`
- Create: `tests/e2e/superficies-baseline.json`

**Interfaces:**
- Consumes: `data-superficie` (Tarea 2); `addPiece`, `clickAt`, `activarHerramienta`, `dispatch` de `tests/e2e/helpers/lienzo.ts`; `startSimulation` de `tests/e2e/helpers/sim.ts`.
- Produces: `superficiesVisibles(page): Promise<Superficie[]>`, `medirAccion(page, pasos): Promise<string[]>`, `leerBaseline(ruta)`, `fijarBaseline(ruta, medidas)`, y los drivers `abrirAppVacia`, `cargarDxfDeMaria`, `reposo`, `centroDePieza`, `seleccionarPieza`, `abrirPaleta`, `abrirPanel`, `cambiarVista` — la Tarea 14 los reutiliza.

- [ ] **Paso 1: `tests/e2e/helpers/trinquete.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Línea base de un trinquete e2e, con la misma regla que
 * `scripts/ui-contract-baseline.json`: un contador solo BAJA. Con la variable
 * de entorno de actualización el spec escribe lo medido, pero nunca por encima
 * del techo vigente. Nunca se edita a mano.
 */
export interface Baseline {
  _doc: string;
  meta: number;
  estados: Record<string, number>;
}

export function leerBaseline(ruta: string): Baseline {
  return JSON.parse(readFileSync(join(process.cwd(), ruta), 'utf8')) as Baseline;
}

export function fijarBaseline(ruta: string, medidas: Record<string, number>): void {
  const b = leerBaseline(ruta);
  for (const [estado, n] of Object.entries(medidas)) {
    const techo = b.estados[estado];
    if (techo === undefined || n < techo) b.estados[estado] = n;
  }
  writeFileSync(join(process.cwd(), ruta), JSON.stringify(b, null, 2) + '\n');
}
```

- [ ] **Paso 2: `tests/e2e/helpers/superficies.ts`**

```ts
import type { Page } from '@playwright/test';

export interface Superficie { nombre: string; firma: string }

/** No cuentan: ambiente fijo, documento, cromo solo de desarrollo (spec § 3.1 y § 3.4). */
const NO_CUENTAN = ['ambiente', 'documento', 'dev'];
/** Su TEXTO es su contenido: cambiar de texto es «cambiar» (spec § 3.4). */
const CON_FIRMA = ['pista', 'tira', 'toast'];

/**
 * Superficies visibles ahora. «Visible» = caja mayor que cero dentro del
 * viewport, sin `display:none` ni `visibility:hidden`, opacidad acumulada por
 * encima de 0,05. La oclusión (quién tapa a quién) no se mide aquí: es el
 * trabajo de los specs de emplazamiento.
 */
export async function superficiesVisibles(page: Page): Promise<Superficie[]> {
  return page.evaluate(({ noCuentan, conFirma }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const opacidad = (el: Element): number => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
      return o;
    };
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      return opacidad(el) > 0.05;
    };
    const salida: Array<{ nombre: string; firma: string }> = [];
    const vistas = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('[data-superficie]'))) {
      const nombre = el.getAttribute('data-superficie') ?? '';
      if (noCuentan.includes(nombre) || !visible(el)) continue;
      const firma = conFirma.includes(nombre) ? (el.textContent ?? '').trim().replace(/\s+/g, ' ') : '';
      const clave = `${nombre}|${firma}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push({ nombre, firma });
    }
    return salida;
  }, { noCuentan: NO_CUENTAN, conFirma: CON_FIRMA });
}

/** Nombres que aparecen o cambian en `ahora` respecto de `antes`. */
export function cambios(antes: Superficie[], ahora: Superficie[]): string[] {
  const previas = new Map<string, Set<string>>();
  for (const s of antes) {
    if (!previas.has(s.nombre)) previas.set(s.nombre, new Set());
    previas.get(s.nombre)!.add(s.firma);
  }
  const nombres = new Set<string>();
  for (const s of ahora) {
    const firmas = previas.get(s.nombre);
    if (!firmas || !firmas.has(s.firma)) nombres.add(s.nombre);
  }
  return [...nombres].sort();
}

/**
 * Mide una acción: foto al empezar, un paso, foto, otro paso, foto… El
 * resultado es la unión de lo que apareció o cambió en algún paso respecto de
 * la foto inicial («aparecen o cambian», spec § 3.4).
 */
export async function medirAccion(page: Page, pasos: Array<() => Promise<void>>): Promise<string[]> {
  const base = await superficiesVisibles(page);
  const union = new Set<string>();
  for (const paso of pasos) {
    await paso();
    await page.waitForTimeout(350);
    for (const n of cambios(base, await superficiesVisibles(page))) union.add(n);
  }
  return [...union].sort();
}

/** Lo que hay en reposo: nombres distintos visibles, sin foto previa. */
export async function enReposo(page: Page): Promise<string[]> {
  const visibles = await superficiesVisibles(page);
  return [...new Set(visibles.map((s) => s.nombre))].sort();
}
```

- [ ] **Paso 3: `tests/e2e/helpers/estados.ts`**

```ts
import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** El patrón real de María (5 piezas), el mismo que usan los specs de emplazamiento. */
export const FIXTURE_MARIA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/garments/maria_patrones_samuel_2M.dxf',
);

interface VentanaConStore {
  __VINA_STORE__?: { getState: () => unknown; dispatch: (a: unknown) => void };
}

export async function abrirAppVacia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('vina-docks');
    localStorage.removeItem('vina-bar-position');
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as VentanaConStore).__VINA_STORE__), { timeout: 20_000 });
  await expect(page.locator('svg.pattern-svg')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
}

export async function cargarDxfDeMaria(page: Page): Promise<void> {
  await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE_MARIA);
  await expect.poll(async () => page.locator('[data-piece-id]').count(), { timeout: 30_000 }).toBe(5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(600);
}

/** Cierra los toasts y suelta cualquier selección o herramienta: el reposo de verdad. */
export async function reposo(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLButtonElement>('.toast__dismiss').forEach((b) => b.click());
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/** Centro de la pieza más grande en pantalla (px de ventana). */
export async function centroDePieza(page: Page): Promise<{ x: number; y: number }> {
  const cajas = await page.locator('[data-piece-id] .piece-fill').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  const mayor = cajas.filter((c) => c.w > 0 && c.h > 0).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!mayor) throw new Error('ninguna pieza tiene caja en pantalla');
  return { x: mayor.x + mayor.w / 2, y: mayor.y + mayor.h / 2 };
}

export async function seleccionarPieza(page: Page): Promise<{ x: number; y: number }> {
  await page.keyboard.press('z');
  const c = await centroDePieza(page);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('.floating-action-bar')).toBeVisible({ timeout: 5_000 });
  return c;
}

export async function abrirPaleta(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.locator('.unified-bar__panel')).toBeVisible({ timeout: 5_000 });
}

/** `comando` es el texto del ítem en la paleta; `titulo`, el de la cabecera del panel. */
export async function abrirPanel(page: Page, comando: string, titulo: string): Promise<void> {
  await abrirPaleta(page);
  await page.locator('.unified-bar__panel').getByText(comando, { exact: true }).first().click();
  await expect(page.locator('.context-panel__header', { hasText: titulo }).first()).toBeVisible({ timeout: 8_000 });
}

export async function cambiarVista(page: Page, etiqueta: '2D' | 'Split' | '3D'): Promise<void> {
  await page.locator('.pill-group').getByRole('button', { name: etiqueta, exact: true }).click();
  await page.waitForTimeout(700);
}
```

- [ ] **Paso 4: la línea base vacía `tests/e2e/superficies-baseline.json`**

```json
{
  "_doc": "Techos del trinquete de superficies por acción (spec 2026-09-24 «cromo callado» § 3.4). Solo bajan: SUPERFICIES_UPDATE=1 npx playwright test superficies-por-accion. La meta es 4; ninguna acción puede volver a subir por encima de su techo.",
  "meta": 4,
  "estados": {}
}
```

- [ ] **Paso 5: `tests/e2e/superficies-por-accion.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { addPiece, clickAt, activarHerramienta, dispatch } from './helpers/lienzo';
import { startSimulation } from './helpers/sim';
import { medirAccion, enReposo } from './helpers/superficies';
import { leerBaseline, fijarBaseline } from './helpers/trinquete';
import {
  abrirAppVacia, cargarDxfDeMaria, reposo, centroDePieza, seleccionarPieza,
  abrirPaleta, abrirPanel, cambiarVista,
} from './helpers/estados';

/**
 * Trinquete de superficies por acción (spec 2026-09-24 «cromo callado» § 3.4).
 *
 * Cuenta, para cada acción de María, las superficies que APARECEN o CAMBIAN
 * (la cabina del objeto cuenta 1; el ambiente no cuenta), y falla si la cuenta
 * supera el techo guardado en `superficies-baseline.json`. La meta es 4. Hoy
 * (F0) solo mide y fija la línea base; F2 y F4 la bajan.
 *
 * Serial a propósito: `medidas` se acumula en el proceso para escribir la línea
 * base al final con SUPERFICIES_UPDATE=1.
 */
const BASELINE = 'tests/e2e/superficies-baseline.json';
/** Espejo de `DOCK_WIDTH_PX` (PatternEditor.tsx): borde derecho del dock izquierdo, en px. */
const DOCK_ANCHO = 68;

const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};

function registrar(accion: string, nombres: string[]): void {
  medidas[accion] = nombres.length;
  const techo = baseline.estados[accion];
  console.log(`superficies · ${accion}: ${nombres.length} [${nombres.join(', ')}] · techo ${techo ?? '—'} · meta ${baseline.meta}`);
  if (techo !== undefined) {
    expect(nombres.length, `${accion}: aparecieron o cambiaron ${nombres.join(', ')}`).toBeLessThanOrEqual(techo);
  }
}

test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  if (process.env.SUPERFICIES_UPDATE) fijarBaseline(BASELINE, medidas);
});

test.describe('con el patrón de María (1366×768)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await abrirAppVacia(page);
  });

  test('importar DXF', async ({ page }) => {
    registrar('importar DXF', await medirAccion(page, [() => cargarDxfDeMaria(page)]));
  });

  test('reposo con patrón', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('reposo con patrón', await enReposo(page));
  });

  test('seleccionar y mover pieza', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('seleccionar y mover pieza', await medirAccion(page, [
      async () => { await seleccionarPieza(page); },
      async () => {
        const c = await centroDePieza(page);
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x + 40, c.y + 20, { steps: 8 });
        await page.mouse.up();
      },
    ]));
  });

  test('escribir una cota', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    await seleccionarPieza(page);
    registrar('escribir una cota', await medirAccion(page, [
      async () => { await page.locator('.cota').first().click(); },
      async () => { await page.keyboard.type('200'); await page.keyboard.press('Enter'); },
    ]));
  });

  test('editar un punto (Q)', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('editar un punto (Q)', await medirAccion(page, [
      async () => {
        await page.keyboard.press('q');
        const c = await centroDePieza(page);
        await page.mouse.click(c.x, c.y);
      },
      async () => {
        await page.locator('[data-command-index]:not([data-interna] *) [data-anchor-role="corner"]').first().click();
      },
    ]));
  });

  test('simular en 3D', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    await cambiarVista(page, '3D');
    registrar('simular en 3D', await medirAccion(page, [
      async () => { await startSimulation(page); await page.waitForTimeout(2500); },
    ]));
  });

  test('ajustar avatar', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('ajustar avatar', await medirAccion(page, [
      () => abrirPanel(page, 'Avatar y medidas', 'Avatar'),
    ]));
  });

  test('cambiar de vista', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('cambiar de vista', await medirAccion(page, [
      () => cambiarVista(page, 'Split'),
      () => cambiarVista(page, '2D'),
    ]));
  });

  test('Split en reposo', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await cambiarVista(page, 'Split');
    await reposo(page);
    registrar('Split en reposo', await enReposo(page));
  });

  test('convocar la IA', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('convocar la IA', await medirAccion(page, [
      async () => { await page.keyboard.press('Control+/'); },
      () => abrirPaleta(page),
    ]));
  });

  test('menú contextual', async ({ page }) => {
    await cargarDxfDeMaria(page);
    await reposo(page);
    registrar('menú contextual', await medirAccion(page, [
      async () => {
        const c = await centroDePieza(page);
        await page.mouse.click(c.x, c.y, { button: 'right' });
        await expect(page.locator('.context-menu')).toBeVisible({ timeout: 5_000 });
      },
    ]));
  });
});

test.describe('con un rectángulo sembrado (lados rectos conocidos)', () => {
  // 300×400 mm con la esquina en (120,120): lado izquierdo x=120, derecho x=420,
  // arriba y=120, abajo y=520 — en coordenadas de patrón, que `clickAt` traduce.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await abrirAppVacia(page);
    await addPiece(page, 'rect-superficies', { x: 120, y: 120 }, 300, 400);
    await reposo(page);
  });

  test('dibujar con Pluma (H)', async ({ page }) => {
    registrar('dibujar con Pluma (H)', await medirAccion(page, [
      () => activarHerramienta(page, 'h', 'pen'),
      () => clickAt(page, { x: 600, y: 200 }),
      () => clickAt(page, { x: 700, y: 200 }),
      () => clickAt(page, { x: 700, y: 300 }),
    ]));
    await page.keyboard.press('Escape');
  });

  test('Rectángulo (S)', async ({ page }) => {
    registrar('Rectángulo (S)', await medirAccion(page, [
      () => activarHerramienta(page, 's', 'rectangle'),
      async () => {
        const svg = await page.locator('svg.pattern-svg').boundingBox();
        if (!svg) throw new Error('no svg');
        await page.mouse.move(svg.x + 700, svg.y + 200);
        await page.mouse.down();
        await page.mouse.move(svg.x + 860, svg.y + 320, { steps: 8 });
        await page.mouse.up();
      },
    ]));
  });

  test('coser dos lados (N)', async ({ page }) => {
    registrar('coser dos lados (N)', await medirAccion(page, [
      () => activarHerramienta(page, 'n', 'seam'),
      () => clickAt(page, { x: 120, y: 300 }),
      () => clickAt(page, { x: 420, y: 300 }),
    ]));
  });

  test('poner piquete (⇧N)', async ({ page }) => {
    registrar('poner piquete (⇧N)', await medirAccion(page, [
      async () => {
        await dispatch(page, 'editor/setActiveTool', 'notch');
        await dispatch(page, 'tools/setActiveTool2D', 'notch');
        await page.waitForTimeout(300);
      },
      () => clickAt(page, { x: 120, y: 320 }),
    ]));
  });

  test('margen de costura (O)', async ({ page }) => {
    registrar('margen de costura (O)', await medirAccion(page, [
      () => activarHerramienta(page, 'o', 'seamAllowance'),
      () => clickAt(page, { x: 120, y: 340 }),
    ]));
  });

  test('medir (M)', async ({ page }) => {
    registrar('medir (M)', await medirAccion(page, [
      () => activarHerramienta(page, 'm', 'measure'),
      () => clickAt(page, { x: 120, y: 120 }),
      () => clickAt(page, { x: 420, y: 120 }),
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

- [ ] **Paso 6: Correr en modo actualización y fijar la línea base**

```bash
SUPERFICIES_UPDATE=1 npx playwright test tests/e2e/superficies-por-accion.spec.ts --reporter=list
cat tests/e2e/superficies-baseline.json
```
Esperado: 17 tests en verde (con `estados` vacío nada se afirma salvo el dock); el JSON queda con 16 acciones y sus cuentas. Sanidad: «reposo con patrón» debe listar `[barra, fila, pista, tira]` (4) y «Split en reposo» esas mismas más `mapas`. Si «escribir una cota» o «editar un punto (Q)» fallan por selector, mirar `test-results/` antes de tocar el driver: el chip es `.cota` y el glifo `[data-anchor-role="corner"]`, ambos existen en `main`.

- [ ] **Paso 7: Segunda corrida sin actualización (ahora sí afirma) y commit**

```bash
npx playwright test tests/e2e/superficies-por-accion.spec.ts --reporter=list
npx eslint tests/e2e/helpers/trinquete.ts tests/e2e/helpers/superficies.ts tests/e2e/helpers/estados.ts tests/e2e/superficies-por-accion.spec.ts
git add tests/e2e && git commit -m "test(e2e): trinquete de superficies por acción con la línea base de hoy (F0, spec § 3.4)"
```

### Tarea 4: Capturas de producción y PR de F0

**Files:**
- Create: `scripts/capturas-ui.mjs`
- Modify: `package.json` (scripts: `"audit:capturas": "node scripts/capturas-ui.mjs"`)

- [ ] **Paso 1: `scripts/capturas-ui.mjs`**

```js
#!/usr/bin/env node
/**
 * Capturas de la interfaz VIVA de Vina en los estados que decide una revisión
 * de diseño, con el patrón real de María, en dos resoluciones (la laptop de
 * María y un escritorio). Reusa la mecánica de `ui-surface-audit.mjs` (store
 * expuesto en `window.__VINA_STORE__`, `setInputFiles` del DXF).
 *
 * Se corre contra un BUILD DE PRODUCCIÓN, no contra el dev server: dos
 * superficies (`TopBar.tsx:81`, `SolverMetrics.tsx:36`) solo existen en DEV y
 * en las capturas del 24-09 exageraban el cromo.
 *
 *   npm run build && npx vite preview --port 4174 --strictPort     # terminal 1
 *   node scripts/capturas-ui.mjs --fecha=2026-09-26 [--sufijo=-f1] [--url=http://localhost:4174]
 *
 * Salida: docs/reports/ui-audit-<fecha><sufijo>/capturas/*.png y
 * superficies.json (qué `data-superficie` estaba visible en cada captura).
 * La carpeta ui-audit-* está ignorada por git a propósito.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre) => process.argv.slice(2).find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const FECHA = arg('fecha');
if (!FECHA || !/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) {
  console.error('Falta --fecha=YYYY-MM-DD (sin valor por defecto: dos corridas del mismo día se pisarían).');
  process.exit(1);
}
const SUFIJO = arg('sufijo') ?? '';
const BASE_URL = (arg('url') ?? 'http://localhost:4174').replace(/\/$/, '');
const FIXTURE = path.join(REPO, 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const OUT = path.join(REPO, 'docs/reports', `ui-audit-${FECHA}${SUFIJO}`, 'capturas');
const VIEWPORTS = [
  { name: 'maria-1366x768', width: 1366, height: 768 },
  { name: 'desk-1600x1000', width: 1600, height: 1000 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Storage.clearDataForOrigin', { origin: new URL(BASE_URL).origin, storageTypes: 'all' });

const registro = {};
const settle = (ms = 400) => page.waitForTimeout(ms);
const superficies = () => page.evaluate(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const visibles = new Set();
  for (const el of document.querySelectorAll('[data-superficie]')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    visibles.add(el.getAttribute('data-superficie'));
  }
  return [...visibles].sort();
});
const shot = async (nombre) => {
  await settle();
  await page.screenshot({ path: path.join(OUT, `${nombre}.png`) });
  registro[nombre] = await superficies();
  console.log('captura', nombre, registro[nombre].join(' '));
};
const dismissToasts = () => page.evaluate(() => {
  document.querySelectorAll('.toast__dismiss').forEach((b) => b.click());
}).catch(() => {});

async function waitForApp(piezas) {
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForFunction(() => Boolean(window.__VINA_STORE__?.getState), undefined, { timeout: 60_000 });
  await page.waitForFunction((n) => (window.__VINA_STORE__.getState().project?.pieces?.length ?? 0) === n, piezas, { timeout: 60_000 });
  await page.locator('svg.pattern-svg').waitFor({ state: 'attached', timeout: 20_000 });
}
async function clickViewMode(label) {
  await page.locator('.pill-group').getByRole('button', { name: label, exact: true }).click();
  await settle(900);
}
async function pieceInteriorPoint() {
  return page.locator('svg.pattern-svg').evaluate((svg) => {
    const fills = [...svg.querySelectorAll('.pattern-piece .piece-fill')]
      .map((fill) => ({ fill, rect: fill.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    const fr = [0.5, 0.35, 0.65, 0.2, 0.8];
    for (const { fill, rect } of fills) {
      const inv = fill.getScreenCTM()?.inverse();
      if (!inv) continue;
      const owner = fill.closest('[data-piece-id]');
      for (const fy of fr) for (const fx of fr) {
        const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy;
        if (!fill.isPointInFill(new DOMPoint(x, y).matrixTransform(inv))) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest('[data-piece-id]') === owner) return { x, y };
      }
    }
    return null;
  });
}
async function abrirPanel(comando) {
  await page.keyboard.press('Control+k'); await settle(400);
  await page.locator('.unified-bar__panel').getByText(comando, { exact: true }).first().click().catch(() => {});
  await settle(900);
}

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await waitForApp(0);
await settle(1500);
await dismissToasts();
await shot('01-vacio');

await page.locator('input[accept=".dxf"]').setInputFiles(FIXTURE);
await page.waitForFunction(() => window.__VINA_STORE__.getState().project.pieces.length === 5, undefined, { timeout: 60_000 });
await settle(1500);
await shot('01b-dxf-recien-cargado');
await dismissToasts();

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await settle(1200);
  await dismissToasts();
  await page.keyboard.press('Escape');
  const P = (n) => `${vp.name}--${n}`;

  await clickViewMode('2D');
  await shot(P('02-2d-cargado'));

  await page.keyboard.press('z');
  const pt = await pieceInteriorPoint();
  if (pt) { await page.mouse.click(pt.x, pt.y); await settle(600); }
  await shot(P('03-2d-pieza-seleccionada'));

  if (pt) {
    await page.locator('[data-piece-id]').first().click({ button: 'right' }).catch(() => {});
    await page.locator('.context-menu').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  }
  await shot(P('04-2d-menu-contextual'));
  await page.keyboard.press('Escape'); await settle(300);

  await page.keyboard.press('Escape');
  await page.keyboard.press('h'); await settle(500);
  await shot(P('05-2d-pluma-activa'));
  await page.keyboard.press('Escape');

  await page.keyboard.press('q');
  if (pt) { await page.mouse.click(pt.x, pt.y); await settle(600); }
  await shot(P('06-2d-editar-patron'));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k'); await settle(500);
  await shot(P('07-paleta'));
  await page.keyboard.press('Escape');

  await page.locator('.unified-bar__modes').getByRole('button', { name: 'Modo ajustes', exact: true }).click().catch(() => {});
  await settle(500);
  await shot(P('08-barra-ajustes'));
  await page.locator('.unified-bar__modes').getByRole('button', { name: 'Modo chat', exact: true }).click().catch(() => {});
  await page.keyboard.press('Escape');

  await page.locator('.logo-menu__trigger').click().catch(() => {});
  await settle(400);
  await shot(P('10-menu-logo'));
  await page.keyboard.press('Escape');

  await page.keyboard.press('z');
  if (pt) { await page.mouse.click(pt.x, pt.y); await settle(400); }
  await abrirPanel('Propiedades');
  await shot(P('11-panel-propiedades'));
  await abrirPanel('Capas');
  await shot(P('12-panel-capas'));
  await abrirPanel('Avatar y medidas');
  await shot(P('12b-panel-avatar'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('s'); await settle(500);
  await shot(P('12c-rectangulo-tira'));
  await page.keyboard.press('Escape');

  await clickViewMode('Split');
  await shot(P('13-split'));
  await clickViewMode('3D');
  await settle(1500);
  await shot(P('14-3d'));
  await page.locator('.dock--right').getByRole('button', { name: 'Simular', exact: true }).click().catch(() => {});
  await settle(4000);
  await shot(P('15-3d-simulando'));
  await page.locator('.dock--right').getByRole('button', { name: /Detener|Pausar|Parar|Simular/ }).first().click().catch(() => {});
}

await writeFile(path.join(OUT, 'superficies.json'), JSON.stringify(registro, null, 2) + '\n');
await browser.close();
console.log('OK', OUT);
```

- [ ] **Paso 2: Añadir el script a `package.json`** (junto a `"audit:ui"`):

```json
"audit:capturas": "node scripts/capturas-ui.mjs",
```

- [ ] **Paso 3: Correrlo contra producción**

```bash
npm run build
npx vite preview --port 4174 --strictPort &   # o en otra terminal
node scripts/capturas-ui.mjs --fecha=2026-09-26
```
Esperado: 35 PNG en `docs/reports/ui-audit-2026-09-26/capturas/` y `superficies.json`. Abrir `maria-1366x768--02-2d-cargado.png` y `--15-3d-simulando.png` con `Read` y comprobar que **no** aparecen «● En reposo · 5 piezas» arriba a la derecha ni «▲ Solver» abajo (eran DEV). La carpeta no se commitea (gitignore `docs/reports/ui-audit-*/`).

- [ ] **Paso 4: Gates y commit**

```bash
npx eslint scripts/capturas-ui.mjs && node scripts/ui-contract-lint.mjs
git add scripts/capturas-ui.mjs package.json && git commit -m "chore(ui): capturas de producción de la interfaz viva (F0)"
```

- [ ] **Paso 5: Cierre de F0**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
npx playwright test tests/e2e/superficies-por-accion.spec.ts tests/e2e/emplazamiento-tira.spec.ts tests/e2e/emplazamiento-paneles.spec.ts --reporter=list
git push -u origin feat/cromo-callado-f0
```
Abrir el PR «F0 · cromo callado: superficies declaradas, trinquete por acción y capturas de producción» hacia `main`, con la tabla de `superficies-baseline.json` en la descripción. Samuel mezcla; F1 arranca desde esta rama sin esperar.

---

## F1 — La piel

### Tarea 5: Rama F1

- [ ] **Paso 1**

```bash
git switch -c feat/cromo-callado-f1 feat/cromo-callado-f0
```

### Tarea 6: `colorMath` — OKLCH → sRGB y contraste, un solo lugar

Hoy hay tres copias de la aritmética de contraste (`acento-legible.test.ts` solo lee hex; `cotas-contraste.test.ts` y `HintText.legibilidad.test.tsx` cada una la suya). La piel nueva se escribe en `oklch()`, así que la copia que solo lee hex se rompería. Un módulo, usado por los tests y por el script.

**Files:**
- Create: `src/styles/colorMath.ts`
- Create: `src/styles/__tests__/colorMath.test.ts`

**Interfaces:**
- Produces: `oklchToRgb(L, C, h): RGB`, `parseCssColor(css): RGBA`, `toHex(rgb): string`, `relativeLuminance(rgb): number`, `contrastRatio(a: RGB, b: RGB): number`, `compositeOver(fg: RGBA, bg: RGB): RGB`, `resolveToken(css, name): string`, `tokenColor(css, name): RGBA`. Tipos `RGB = [number, number, number]`, `RGBA = { rgb: RGB; alpha: number }`.

- [ ] **Paso 1: El test que falla**

`src/styles/__tests__/colorMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  oklchToRgb, parseCssColor, toHex, contrastRatio, compositeOver, resolveToken, tokenColor,
} from '../colorMath';

describe('colorMath — OKLCH → sRGB', () => {
  it('convierte el acento de la piel al hex que documenta tokens.css', () => {
    expect(toHex(oklchToRgb(0.6, 0.16, 248))).toBe('#0584da');
    expect(toHex(oklchToRgb(0.19, 0.005, 80))).toBe('#151411');
  });
  it('recorta a gama en vez de devolver negativos', () => {
    // --accent-2d-fuerte queda apenas fuera de sRGB; el navegador lo recorta igual.
    expect(toHex(oklchToRgb(0.54, 0.15, 248))).toBe('#0072c0');
  });
});

describe('colorMath — parseCssColor acepta lo que hay en tokens.css', () => {
  it('hex corto, largo y con alfa', () => {
    expect(parseCssColor('#fff')).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(parseCssColor('#0584da')).toEqual({ rgb: [5, 132, 218], alpha: 1 });
    expect(parseCssColor('#00000080').alpha).toBeCloseTo(0.5, 1);
  });
  it('rgb() y rgba() con comas o con barra', () => {
    expect(parseCssColor('rgba(255, 255, 255, 0.07)')).toEqual({ rgb: [255, 255, 255], alpha: 0.07 });
    expect(parseCssColor('rgb(8 7 6 / 55%)')).toEqual({ rgb: [8, 7, 6], alpha: 0.55 });
  });
  it('oklch() con y sin alfa', () => {
    expect(parseCssColor('oklch(0.60 0.16 248)')).toEqual({ rgb: [5, 132, 218], alpha: 1 });
    expect(parseCssColor('oklch(0.60 0.16 248 / 14%)').alpha).toBeCloseTo(0.14);
  });
  it('rechaza lo que no sabe leer, en vez de devolver negro', () => {
    expect(() => parseCssColor('var(--accent)')).toThrow(/no sé leer/);
  });
});

describe('colorMath — contraste y composición', () => {
  it('blanco sobre negro es 21:1', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
  });
  it('compone un color con alfa sobre un fondo opaco', () => {
    expect(compositeOver({ rgb: [255, 255, 255], alpha: 0.5 }, [0, 0, 0])).toEqual([128, 128, 128]);
  });
});

describe('colorMath — tokens', () => {
  const CSS = `:root {\n  --a: oklch(0.60 0.16 248);\n  --b: var(--a);\n  --c: var(--b);\n  --ciclo: var(--ciclo);\n}`;
  it('resuelve una cadena de var()', () => {
    expect(resolveToken(CSS, '--c')).toBe('oklch(0.60 0.16 248)');
    expect(tokenColor(CSS, '--c').rgb).toEqual([5, 132, 218]);
  });
  it('avisa del token que no existe y del ciclo', () => {
    expect(() => resolveToken(CSS, '--nada')).toThrow(/no existe/);
    expect(() => resolveToken(CSS, '--ciclo')).toThrow(/ciclo/);
  });
});
```

- [ ] **Paso 2: Verlo fallar** — `npx vitest run src/styles/__tests__/colorMath.test.ts` → FAIL «Cannot find module '../colorMath'».

- [ ] **Paso 3: `src/styles/colorMath.ts`**

```ts
/**
 * Aritmética de color de la piel: OKLCH → sRGB y contraste WCAG 2.
 *
 * Un solo lugar, porque hasta el 26-09 había tres copias en tests y la que
 * más importaba (`acento-legible`) solo sabía leer `#rrggbb`: un token escrito
 * en `oklch()` la dejaba ciega, que es como sobrevivió el 3,10:1 de las cotas
 * (revisión 2026-09-04, F5). Lo usan los tests de tokens, `contrasteDeTokens.ts`
 * y `scripts/contraste-tokens.ts`.
 */
export type RGB = [number, number, number];
export interface RGBA { rgb: RGB; alpha: number }

const NOMBRADOS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'rgba(0, 0, 0, 0)',
};

const canal = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

/** OKLCH (L 0-1, C, h en grados) → sRGB 8 bits, recortado a gama como hace el navegador. */
export function oklchToRgb(L: number, C: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    canal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    canal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    canal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const alfa = (s: string | undefined): number => {
  if (s === undefined) return 1;
  const t = s.trim();
  return t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
};

/** Lee #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() con comas o barra, oklch() con o sin alfa, y tres nombres. */
export function parseCssColor(value: string): RGBA {
  const v = value.trim().toLowerCase();
  if (NOMBRADOS[v]) return parseCssColor(NOMBRADOS[v]);

  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { rgb: n, alpha: a };
  }

  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgb) {
    return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: alfa(rgb[4]) };
  }

  const ok = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/);
  if (ok) {
    return { rgb: oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3])), alpha: alfa(ok[4]) };
  }

  throw new Error(`no sé leer el color "${value}"`);
}

export function relativeLuminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `fg` con su alfa, encima de un fondo opaco. */
export function compositeOver(fg: RGBA, bg: RGB): RGB {
  return fg.rgb.map((v, i) => Math.round(v * fg.alpha + bg[i] * (1 - fg.alpha))) as RGB;
}

/** Valor declarado de un token en un CSS, siguiendo cadenas `var(--otro)`. */
export function resolveToken(css: string, name: string, vistos = new Set<string>()): string {
  if (vistos.has(name)) throw new Error(`ciclo de tokens en ${name}`);
  vistos.add(name);
  const m = css.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'));
  if (!m) throw new Error(`El token ${name} no existe`);
  const valor = m[1].trim();
  const ref = valor.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveToken(css, ref[1], vistos) : valor;
}

export function tokenColor(css: string, name: string): RGBA {
  return parseCssColor(resolveToken(css, name));
}
```

- [ ] **Paso 4: Verlo pasar** — `npx vitest run src/styles/__tests__/colorMath.test.ts` → 9 tests en verde.

- [ ] **Paso 5: Commit**

```bash
npx tsc -b --noEmit && npx eslint src/styles/colorMath.ts src/styles/__tests__/colorMath.test.ts
git add src/styles/colorMath.ts src/styles/__tests__/colorMath.test.ts
git commit -m "feat(ui): colorMath — OKLCH a sRGB y contraste WCAG en un solo módulo"
```

### Tarea 7: `tokens.css` — la piel entera, con sus pares de contraste verificados

Se escribe el archivo completo. Los tokens viejos que aún tienen consumidores (`--text-ghost`, `--text-dim`, `--accent-hover`, `--dock-auto`, `--ai-2d`) quedan como **alias transitorios** hasta la Tarea 13; los que no tienen ninguno (`--radius-xl`, `--blur`) se retiran aquí. El bloque heredado de `App.css` pasa a alias en `tokens.css` (R4 baja a 1).

**Files:**
- Create: `src/styles/contrasteDeTokens.ts`, `src/styles/__tests__/contrasteDeTokens.test.ts`, `scripts/contraste-tokens.ts`
- Modify: `src/styles/tokens.css` (completo), `src/App.css:8-29` (borrar el bloque `:root`), `src/components/Viewport3D/RenderSettingsPanel.css:19-20`, `src/styles/__tests__/acento-legible.test.ts` (reescribir), `src/components/PatternEditor/cotas/__tests__/cotas-contraste.test.ts:123-129`, `package.json` (script `lint:contraste`), `scripts/ui-contract-baseline.json` (vía `--update`)

**Interfaces:**
- Consumes: `colorMath` (Tarea 6).
- Produces: `PARES: Par[]` y `verificarContraste(css): Resultado[]` en `contrasteDeTokens.ts`; los tokens nuevos `--text-tertiary`, `--text-disabled`, `--hairline`, `--scene-3d`, `--ai`, `--destructive-fuerte`, `--text-1..5`, `--leading-1..5`, y los alias `--bg-primary`, `--bg-secondary`, `--panel-bg`, `--accent-dim`, `--color-error`, `--color-warning`, `--color-success`, `--grainline-color`.

- [ ] **Paso 1: `src/styles/contrasteDeTokens.ts` y su test (rojo hasta el paso 3)**

```ts
import { contrastRatio, tokenColor } from './colorMath';

/**
 * Los pares de la piel que tienen que cumplir un piso (spec 2026-09-24
 * «cromo callado» § 4). Texto normal: AA 4,5:1. Objeto gráfico (una línea,
 * un borde, un relleno sin texto): 3:1. Deshabilitado: 2,5:1 — WCAG lo exime,
 * pero por debajo de eso ni se ve que hay un control.
 */
export interface Par { tinta: string; fondo: string; minimo: number; por: string }
export interface Resultado extends Par { ratio: number; ok: boolean }

export const PARES: Par[] = [
  { tinta: '--text-primary', fondo: '--bg-surface', minimo: 4.5, por: 'texto principal' },
  { tinta: '--text-primary', fondo: '--bg-elevated', minimo: 4.5, por: 'texto principal sobre un botón' },
  { tinta: '--text-secondary', fondo: '--bg-surface', minimo: 4.5, por: 'rótulos' },
  { tinta: '--text-secondary', fondo: '--bg-elevated', minimo: 4.5, por: 'rótulos sobre un botón' },
  { tinta: '--text-tertiary', fondo: '--bg-surface', minimo: 4.5, por: 'atajos, meta, placeholder' },
  { tinta: '--text-tertiary', fondo: '--bg-elevated', minimo: 4.5, por: 'kbd sobre elevated' },
  { tinta: '--text-disabled', fondo: '--bg-surface', minimo: 2.5, por: 'solo deshabilitado' },
  { tinta: '--accent-ink', fondo: '--bg-surface', minimo: 4.5, por: 'el acento escrito' },
  { tinta: '--accent-ink', fondo: '--bg-elevated', minimo: 4.5, por: 'el acento escrito sobre un botón' },
  { tinta: '--on-accent', fondo: '--accent-fuerte', minimo: 4.5, por: 'texto blanco sobre relleno de acento' },
  { tinta: '--on-accent', fondo: '--destructive-fuerte', minimo: 4.5, por: 'texto blanco sobre Eliminar' },
  { tinta: '--accent', fondo: '--bg-surface', minimo: 3, por: 'borde/relleno del dock activo' },
  { tinta: '--accent', fondo: '--canvas-2d', minimo: 3, por: 'línea de selección sobre el crema' },
  { tinta: '--accent', fondo: '--piece-fill-2d', minimo: 3, por: 'línea de selección sobre la pieza' },
  { tinta: '--accent-fuerte', fondo: '--canvas-2d', minimo: 3, por: 'chip de cota sobre el crema' },
  { tinta: '--ai', fondo: '--bg-surface', minimo: 4.5, por: '«lo hizo la IA»' },
  { tinta: '--success', fondo: '--bg-surface', minimo: 4.5, por: 'semántico' },
  { tinta: '--warning', fondo: '--bg-surface', minimo: 4.5, por: 'semántico' },
  { tinta: '--destructive', fondo: '--bg-surface', minimo: 4.5, por: 'texto destructivo' },
  { tinta: '--border', fondo: '--bg-surface', minimo: 1.3, por: 'un borde igual a su superficie es invisible' },
  { tinta: '--ink-hint', fondo: '--canvas-2d', minimo: 4.5, por: 'pista sobre el papel' },
  { tinta: '--ink-hint', fondo: '--piece-fill-2d', minimo: 4.5, por: 'pista sobre la pieza' },
  { tinta: '--ink-on-light', fondo: '--canvas-2d', minimo: 4.5, por: 'línea de corte y rótulos' },
  { tinta: '--ink-on-light-2', fondo: '--canvas-2d', minimo: 3, por: 'puntos del contorno en reposo' },
  { tinta: '--cota-ink-2d', fondo: '--cota-bg-2d', minimo: 4.5, por: 'el número de la cota' },
  { tinta: '--cota-line-2d', fondo: '--canvas-2d', minimo: 3, por: 'la línea de cota' },
  { tinta: '--cota-edit-ink-2d', fondo: '--cota-edit-bg-2d', minimo: 4.5, por: 'la cota en edición' },
];

export function verificarContraste(css: string): Resultado[] {
  return PARES.map((p) => {
    const ratio = contrastRatio(tokenColor(css, p.tinta).rgb, tokenColor(css, p.fondo).rgb);
    return { ...p, ratio, ok: ratio >= p.minimo };
  });
}
```

`src/styles/__tests__/contrasteDeTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verificarContraste } from '../contrasteDeTokens';

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('la piel cumple sus pisos de contraste (spec 2026-09-24 § 4)', () => {
  it.each(verificarContraste(TOKENS))('$tinta sobre $fondo ≥ $minimo ($por)', (r) => {
    expect(r.ratio, `${r.tinta} sobre ${r.fondo} da ${r.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(r.minimo);
  });
});
```

`scripts/contraste-tokens.ts` (se corre con `npx tsx scripts/contraste-tokens.ts`; imprime la tabla y sale con 1 si algún par falla):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verificarContraste } from '../src/styles/contrasteDeTokens';
import { resolveToken, tokenColor, toHex } from '../src/styles/colorMath';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const resultados = verificarContraste(css);
console.log('\n  tinta                    fondo                    hex tinta  ratio   piso  ');
for (const r of resultados) {
  const hex = toHex(tokenColor(css, r.tinta).rgb);
  console.log(`  ${r.tinta.padEnd(24)} ${r.fondo.padEnd(24)} ${hex}    ${r.ratio.toFixed(2).padStart(5)}   ${String(r.minimo).padStart(4)}  ${r.ok ? '' : '✗ ' + r.por}`);
}
const fallos = resultados.filter((r) => !r.ok);
console.log(fallos.length ? `\n  ✗ ${fallos.length} par(es) por debajo del piso.\n` : '\n  ✓ todos los pares cumplen.\n');
// Recordatorio para quien cambie un token: el hex del comentario sale de aquí.
console.log(`  --accent resuelve a ${resolveToken(css, '--accent')} = ${toHex(tokenColor(css, '--accent').rgb)}`);
process.exit(fallos.length ? 1 : 0);
```

Y en `package.json`, junto a `"lint:ui"`: `"lint:contraste": "tsx scripts/contraste-tokens.ts",`.

- [ ] **Paso 2: Verlo fallar sobre los tokens de hoy**

```bash
npx vitest run src/styles/__tests__/contrasteDeTokens.test.ts
```
Esperado: FAIL, al menos «--accent sobre --canvas-2d» (hoy `--accent` es índigo: no es el par del papel) y «--text-tertiary» / «--destructive-fuerte» / «--ai» («El token … no existe»).

- [ ] **Paso 3: Reescribir `src/styles/tokens.css` completo**

```css
:root {
  /* ── Neutros del cromo — grafito cálido, tono 80 ──────────────────────
   * Cromo callado (spec 2026-09-24 § 4.1). Hasta el 26-09 la rampa era
   * «Midnight Blue» (tono OKLCH 283-285) y el croma SUBÍA al apagar el texto
   * (0,013 en primary → 0,053 en dim): el gris más apagado era lo más violeta
   * de la pantalla, peleando a 190° con el papel (--canvas-2d es tono 94).
   * Ahora toda la rampa está en tono 80, la familia del papel, con croma
   * constante 0,004-0,008. Los ratios los verifica contrasteDeTokens.ts;
   * `npx tsx scripts/contraste-tokens.ts` imprime la tabla. */
  --bg-deeper: oklch(0.13 0.004 80);    /* #080706 */
  --bg-base: oklch(0.16 0.004 80);      /* #0e0d0b */
  --bg-surface: oklch(0.19 0.005 80);   /* #151411 */
  --bg-elevated: oklch(0.25 0.006 80);  /* #23211e */
  /* Debe quedar por encima de --bg-elevated en luminosidad: un borde igual a
   * la superficie que delimita es invisible (Iris, 2026-06-07). 1,46:1. */
  --border: oklch(0.32 0.006 80);       /* #34332f */
  --border-subtle: oklch(0.22 0.005 80);/* #1c1a18 */
  /* La línea de pelo: única separación de lo que flota (spec § 4.4). Los
   * separadores de menú NO la copian: usan --border como fondo de 1 px. */
  --hairline: 1px solid rgba(255, 255, 255, 0.07);
  /* Escenario del visor 3D, un paso más claro que el cromo para que la
   * prenda no se lea sobre negro. Consumidor: F3 (renderSettingsSlice). */
  --scene-3d: oklch(0.26 0.004 80);     /* #252422 */

  /* ── Texto — cuatro pasos (spec § 4.2) ─────────────────────────────── */
  --text-primary: oklch(0.93 0.006 80);   /* #eae7e3 · 14,95:1 sobre surface */
  --text-secondary: oklch(0.77 0.008 80); /* #b7b4af · 8,91:1 · rótulos, meta */
  /* Atajos, placeholder, pistas, kbd. 5,50:1 sobre surface, 4,79 sobre
   * elevated, 5,03 sobre el overlay: el escalón bajo que TODAVÍA es texto. */
  --text-tertiary: oklch(0.64 0.008 80);  /* #8f8c87 */
  /* SOLO el estado deshabilitado. Nunca una instrucción ni un atajo: 2,81:1. */
  --text-disabled: oklch(0.48 0.006 80);  /* #5f5d5a */
  /* Alias con 81 consumidores; significa «terciario». No sumar consumidores. */
  --text-muted: var(--text-tertiary);
  /* TRANSITORIOS (se retiran en la Tarea 13 del plan F1, cuando ya no tengan
   * consumidores): vestían atajos e instrucciones a 3,6:1 y 2,2:1. */
  --text-ghost: var(--text-tertiary);
  --text-dim: var(--text-tertiary);

  /* ── Acento — uno, tono 248, tres roles (spec § 4.3) ────────────────
   *   --accent         bordes, tintes, tiradores, línea de selección
   *                    (3,43:1 sobre el crema; 4,67 sobre surface)
   *   --accent-fuerte  relleno sólido que lleva texto blanco (5,04:1)
   *   --accent-ink     el acento ESCRITO sobre el cromo (8,65:1 surface)
   * Es el azul que ya tenían las cotas: el cromo lo adopta, y desaparecen el
   * índigo Tailwind (#6366f1, «indigo-500») y el violeta de AUTO. Los tres
   * roles no son intercambiables (revisión 2026-09-04): lo fija
   * acento-legible.test.ts. */
  --accent: oklch(0.60 0.16 248);           /* #0584da */
  /* Queda apenas fuera de la gama sRGB; el navegador lo recorta a #0072c0,
   * igual que antes del 26-09 (era el paso fuerte del papel desde el 04-09). */
  --accent-2d-fuerte: oklch(0.54 0.15 248);
  --accent-fuerte: var(--accent-2d-fuerte);
  --accent-ink: oklch(0.76 0.11 248);       /* #77b7f4 */
  --accent-subtle: oklch(0.60 0.16 248 / 14%);
  --accent-border: oklch(0.60 0.16 248 / 30%);
  /* TRANSITORIO: era el segundo nombre de --accent-ink. Tarea 13. */
  --accent-hover: var(--accent-ink);
  /* El único segundo tono del sistema: «esto lo hizo la IA». Nunca «activo». */
  --ai: oklch(0.72 0.13 295);               /* #ab93ed · 7,13:1 sobre surface */
  --dock-auto: var(--ai);                   /* TRANSITORIO → Tarea 13 */
  --ai-2d: var(--ai);                       /* TRANSITORIO → Tarea 13 */
  /* Tinta sobre un relleno de acento o destructivo. */
  --on-accent: #ffffff;

  /* ── Semánticos, apagados a la croma de la familia (spec § 4.3) ────── */
  --success: oklch(0.68 0.14 150);          /* #4eb068 · 6,78:1 */
  --warning: oklch(0.75 0.14 75);           /* #e1a035 · 8,14:1 */
  --destructive: oklch(0.62 0.18 25);       /* #de4e4b · 4,65:1 como texto */
  /* Relleno destructivo que lleva texto blanco (el botón Eliminar): con
   * --destructive el blanco da 3,96:1; aquí 6,05:1. Mismo rol que
   * --accent-fuerte. */
  --destructive-fuerte: oklch(0.52 0.18 25); /* #ba2b2e */
  /* Hermano de --accent-ink: lo destructivo también aclara al pasar el mouse. */
  --destructive-hover: oklch(0.70 0.16 25); /* #f2716a */

  /* ── Alias heredados de App.css (2026-07-16) ─────────────────────────
   * Un solo archivo de tokens (R4 = 1). Consumidores: src/copilot/*
   * (--bg-primary/--bg-secondary/--color-*), InputSchemeSection
   * (--accent-dim), AvatarPanel.css (--color-success), Viewport3D.css
   * (--grainline-color). No sumar consumidores: migran en F4 y F5. */
  --bg-primary: var(--bg-surface);
  --bg-secondary: var(--bg-elevated);
  --panel-bg: var(--bg-surface);
  --accent-dim: var(--accent-subtle);
  --color-error: var(--destructive);
  --color-warning: var(--warning);
  --color-success: var(--success);
  --grainline-color: #6bff6b; /* dato del visor 3D (el hilo), no cromo */

  /* ── 2D pattern canvas — el papel NO se toca (spec § 4.6) ───────────
     Namespaced so the dark app chrome is untouched; consumed only by the 2D
     pattern editor renderers. The accent is reserved for selection + seams. */
  --canvas-2d: #f1efe8;
  --grid-2d: #e3dfd2;
  --grid-2d-major: #d8d3c2;
  --ink-on-light: #2b2d33;     /* cut line, primary labels */
  --ink-on-light-2: #6f7480;   /* seam line, grainline, meta labels, puntos del contorno en reposo */
  --ink-on-light-3: #a0a5b0;   /* construction / reference lines */
  /* Identidad de pares de costura sobre el papel. Misma luminosidad perceptual
     y saltos de 35–50° de tono: se distinguen sin convertir una costura en
     protagonista por ser más clara que sus vecinas. */
  --seam-pair-1: oklch(0.55 0.11 250);
  --seam-pair-2: oklch(0.55 0.11 345);
  --seam-pair-3: oklch(0.55 0.10 150);
  --seam-pair-4: oklch(0.55 0.11 55);
  --seam-pair-5: oklch(0.55 0.10 200);
  --seam-pair-6: oklch(0.55 0.11 295);
  --seam-pair-7: oklch(0.55 0.10 105);
  --seam-pair-8: oklch(0.55 0.11 20);
  /* Selección y costuras: el MISMO acento que el cromo. Hasta el 26-09 era
   * oklch(0.66 0.16 248), que daba 2,70:1 sobre el crema (bajo el 3:1 de un
   * objeto gráfico); a L 0,60 da 3,43:1 y 3,95:1 sobre el blanco de la pieza. */
  --accent-2d: var(--accent);
  --font-mono-2d: var(--font-mono);
  --font-ui-2d: var(--font-sans);
  --piece-fill-2d: #ffffff;                 /* piece interior: paper white, sits above the canvas */
  /* Status/marker hues muted for the cream paper ground: chroma roughly halved,
     hue identity + mutual distinctness kept, so a working piece reads as quiet
     technical markers, not a parade. */
  --piece-error-2d: oklch(0.55 0.14 28);    /* unresolved / invalid geometry — muted brick red */
  --piece-locked-2d: oklch(0.50 0.11 65);   /* locked-piece marker — amber */
  --fold-mountain-2d: oklch(0.50 0.13 335); /* mountain-fold direction — plum */
  --fold-valley-2d: oklch(0.50 0.11 255);   /* valley-fold direction — blue */
  --topstitch-2d: #333333;                  /* topstitch default when the thread has no color set */
  --notch-2d: oklch(0.52 0.115 165);        /* notch — montage registration mark; teal-green */
  /* Enganche de la herramienta de línea interna (spec 2026-08-29 § 4.6): el
   * anillo que dice "el próximo clic cae AQUÍ". Ámbar, más claro que
   * --piece-locked-2d para que no se lea como candado. */
  --snap-2d: oklch(0.72 0.15 80);
  /* Píldora de medida dibujada sobre el papel (largo y ángulo del tramo en
   * curso). Tinta clara sobre fondo oscuro translúcido: cromo pequeño que
   * flota sobre el lienzo, no tinta del patrón. */
  --readout-bg-2d: rgba(43, 45, 51, 0.85);
  --readout-ink-2d: #ffffff;
  --annotation-2d: #808080;                 /* annotation fallback when its category has no color */
  /* Tinta de texto instructivo dibujado SOBRE el papel (pistas al pie del
   * lienzo). NO usar --text-* aquí: esos son la tinta del cromo OSCURO y sobre
   * el crema quedan invisibles (1.05:1 medido el 2026-08-14). Éste da 5.08:1
   * sobre --canvas-2d y 5.84:1 sobre --piece-fill-2d. Lo verifica
   * HintText.legibilidad.test.tsx. */
  --ink-hint: #6b6459;
  /* Seam overlay (SeamRenderer) on the paper ground: tension labels are muted
     warm (gather) / cool (ease). */
  --seam-tension-gather-2d: oklch(0.58 0.11 50);
  --seam-tension-ease-2d: oklch(0.56 0.10 235);

  /* ── Tipografía (spec § 4.5) ────────────────────────────────────────── */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  /* Una sola mono, determinista: JetBrains Mono se carga en index.html; con
   * 'SF Mono' primero, Mac y Windows rendían monos distintas. Mono = un dato
   * cuya alineación carácter a carácter significa algo (regla, cotas, píldora
   * de medida, kbd). La prosa va en --font-sans (contrato § 5). */
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  /* Escala fija de cinco pasos. La anterior era clamp() y a 1366 rendía
   * 10,51 / 11,20 / 16,29 px (fraccionarios en la laptop de María) contra 141
   * font-size literales. Cada paso sube 1 px a partir de 1600 (abajo). */
  --text-1: 11px;  --leading-1: 16px;   /* atajos, meta, pista */
  --text-2: 12px;  --leading-2: 16px;   /* etiquetas, menús, chips, rótulos de sección */
  --text-3: 13px;  --leading-3: 18px;   /* valores, campos, cuerpo de panel, campo de la IA */
  --text-4: 15px;  --leading-4: 20px;   /* título de panel, nombre de herramienta en la tira */
  --text-5: 18px;  --leading-5: 24px;   /* título del estado vacío, nada más */
  /* Alias de la escala anterior, para sus 66 consumidores; migran en F6. */
  --text-xs: var(--text-1);
  --text-sm: var(--text-2);
  --text-ui: var(--text-3);
  --text-input: var(--text-3);
  --text-heading: var(--text-4);
  --text-title: var(--text-5);
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --line-height: 1.5;

  /* Spacing — scales proportionally with font size */
  --sp-1: clamp(4px, 0.3vw, 6px);
  --sp-2: clamp(8px, 0.5vw, 10px);
  --sp-3: clamp(12px, 0.7vw, 16px);
  --sp-4: clamp(16px, 1vw, 20px);
  --sp-6: clamp(24px, 1.4vw, 32px);
  --sp-8: clamp(32px, 1.8vw, 40px);

  /* Radios concéntricos (spec § 4.4): superficie 8, control 6; el dock lleva
   * 10 porque interior (6) + padding (4) = exterior. El 12 de antes se retiró:
   * un dock de 52 px, una tira de 300 y un panel de 310 llevaban el mismo. */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;

  /* Sizes — scale with viewport for comfort on large displays */
  --top-bar-h: clamp(36px, 2.5vw, 48px);
  --unified-bar-h: clamp(44px, 3vw, 56px);
  --toolbar-btn: clamp(28px, 2vw, 38px);
  /* Franja inferior que ocupa la barra de IA en su posición por defecto, para
   * que nada acoplado abajo se le meta debajo. 94 = 24 de separación al borde
   * + 58 de alto (BAR_HEIGHT) + 12 de aire; las dos primeras salen de
   * src/components/shell/barPosition.ts. Se retira en F4 (barra convocada). */
  --band-bar: 94px;

  /* Effects */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;

  /* ── Materiales de superficie ─────────────────────────────────────────
   * Ley de materiales del contrato (enmendada el 26-09, spec § 4.4 y § 6).
   * Dos ROLES, un solo material, distinguidos por la sombra:
   *   chrome  → acoplado a una canaleta; opaco; SIN sombra (una sombra de
   *             32 px bajo un dock acoplado era la mancha oscura a su derecha
   *             sobre el crema).
   *   overlay → flota de verdad y se va; casi opaco, línea de pelo, sombra
   *             corta en dos capas, SIN blur: con un fondo al 92 % el blur solo
   *             desenfocaba el 8 % restante y creaba los contextos de
   *             apilamiento que recortaron ConnectionModal (contrato § 2).
   * Más la familia de tinta: `ink-*`, lo que se dibuja SOBRE el papel. */
  --surface-chrome-bg: var(--bg-surface);
  --surface-chrome-border: 1px solid var(--border);
  --surface-chrome-radius: var(--radius-md);
  --surface-chrome-shadow: none;
  /* Variante a RAS de chrome para el cromo que ocupa el ancho de su área (la
   * barra de opciones de herramienta, #1049): sin radio ni sombra. */
  --surface-chrome-radius-flush: 0;
  --surface-chrome-shadow-flush: none;

  --surface-overlay-bg: rgba(21, 20, 17, 0.96);
  --surface-overlay-border: var(--hairline);
  --surface-overlay-radius: var(--radius-md);
  --surface-overlay-shadow: 0 1px 2px rgba(0, 0, 0, 0.28), 0 8px 20px rgba(0, 0, 0, 0.22);
  --surface-overlay-blur: none;
  /* Única excepción de FORMA, y es de rol: la barra de IA es una cápsula. */
  --surface-overlay-radius-pill: 999px;
  /* Reposo de la barra de IA: un solo negro; en reposo solo cambia la sombra. */
  --surface-overlay-bg-recessed: var(--surface-overlay-bg);
  --surface-overlay-shadow-recessed: 0 1px 2px rgba(0, 0, 0, 0.2);
  /* Bordes → tono (cotas vivas, spec 2026-08-30 § 9): la tira y la fila se
   * separan por sombra, no por línea. Una sola sombra de flote. */
  --surface-overlay-border-flush: 1px solid transparent;
  --surface-overlay-shadow-sheet: var(--surface-overlay-shadow);

  /* Cotas sobre el papel: el número que se escribe donde mide. Paso FUERTE
   * del acento (lleva texto encima: blanco 5,04:1; 4,38:1 sobre el crema). */
  --cota-bg-2d: var(--accent-2d-fuerte);
  --cota-ink-2d: #ffffff;
  --cota-line-2d: var(--accent-2d-fuerte);
  --cota-edit-bg-2d: #ffffff;
  --cota-edit-ink-2d: var(--ink-on-light);

  /* Foco como riel de 3 px a la izquierda del campo (no anillo), en el cromo. */
  --focus-rail: 3px solid var(--accent);
  --focus-rail-inset: inset 3px 0 0 0 var(--accent);

  /* Velo detrás de un modal: de la familia del cromo, no negro puro. */
  --scrim: rgb(8 7 6 / 55%);

  /* ── Escala de capas ──────────────────────────────────────────────────
   * Ley de emplazamiento (§ 5.2 del informe 2026-08-14): nada de z-index
   * literal. El orden es de URGENCIA, no de antigüedad. Lo fija
   * zIndexScale.test.ts, escalón por escalón. */
  --z-dock: 5;
  /* Sin consumidor desde que los paneles son hijos flex de .canvas-area
   * (60643b35); se queda porque la escala es un mapa de ROLES. */
  --z-panel: 25;
  /* Cromo acoplado al lienzo: la tira y la fila. Persistentes, no menús
   * (hallazgo F10 del 2026-09-04, enmienda 2026-09-05 del spec de
   * emplazamiento). */
  --z-canvas-chrome: 40;
  /* Aviso transitorio sobre el lienzo («suelta el DXF aquí»). */
  --z-hint: 50;
  --z-bar: 100;
  --z-menu: 200;
  --z-context-menu: 1000;
  --z-modal: 1100;
  /* Un tooltip explica un control; una notificación avisa. Empatados, gana la
   * notificación: por eso este escalón está DEBAJO de --z-toast. */
  --z-tooltip: 1150;
  --z-toast: 1200;
  /* Diagnóstico de desarrollo (SolverMetrics): solo con import.meta.env.DEV. */
  --z-debug: 1300;
}

/* A partir de 1600 px cada paso de la escala sube 1 px (spec § 4.5). */
@media (min-width: 1600px) {
  :root {
    --text-1: 12px;
    --text-2: 13px;
    --text-3: 14px;
    --text-4: 16px;
    --text-5: 19px;
  }
}
```

- [ ] **Paso 4: Borrar el bloque heredado de `src/App.css`** (líneas 8-29, desde el comentario «Legacy CSS variables» hasta el `}` del `:root`). El archivo queda con las cuatro líneas `@import`. Y en `src/components/Viewport3D/RenderSettingsPanel.css:19-20`:

```css
/* antes */
  background: rgba(8, 8, 15, 0.95);
  backdrop-filter: var(--blur);
/* después: material overlay entero, por token */
  background: var(--surface-overlay-bg);
```

- [ ] **Paso 5: Reescribir `src/styles/__tests__/acento-legible.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, resolveToken, tokenColor } from '../colorMath';

/**
 * Revisión adversarial de UI del 2026-09-04 — la regresión que la limpieza de
 * tokens estuvo a punto de dejar dentro: seis sitios pasaron texto a
 * `var(--accent)` y cruzaron el umbral de AA sin que nadie lo viera.
 *
 * De ahí salen los tres roles del acento, que NO son intercambiables:
 *
 *   --accent         bordes, tintes y superficies      (no lleva texto)
 *   --accent-fuerte  relleno sólido con texto blanco    blanco ≥ 4,5:1
 *   --accent-ink     el acento escrito sobre el cromo   sobre el fondo ≥ 4,5:1
 *
 * Desde el 26-09 (cromo callado) el acento es el azul 248 del papel y todos los
 * neutros están en oklch(); por eso la aritmética viene de colorMath.
 */

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const rgb = (name: string) => tokenColor(TOKENS, name).rgb;
const contraste = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

const AA = 4.5;
/** Los fondos del cromo sobre los que puede caer una etiqueta de acento. */
const FONDOS = ['--bg-surface', '--bg-elevated', '--bg-base', '--bg-primary', '--bg-secondary'];

describe('la familia del acento: cada rol cumple lo suyo', () => {
  it.each(FONDOS)('--accent-ink se lee sobre %s', (fondo) => {
    expect(contraste('--accent-ink', fondo)).toBeGreaterThanOrEqual(AA);
  });

  it('--accent-fuerte aguanta texto blanco encima', () => {
    expect(contraste('--on-accent', '--accent-fuerte')).toBeGreaterThanOrEqual(AA);
  });

  it('--destructive-fuerte aguanta texto blanco encima (el botón Eliminar)', () => {
    expect(contraste('--on-accent', '--destructive-fuerte')).toBeGreaterThanOrEqual(AA);
  });

  it('--accent-ink es el paso más legible: escribir con --accent es usar el rol equivocado', () => {
    // Hasta el 26-09 --accent (índigo) se quedaba en ~4,1:1 y este test lo
    // documentaba como "no llega a AA". El acento 248 sí llega (4,67:1), pero
    // el rol de tinta sigue siendo --accent-ink: más claro y más legible.
    expect(contraste('--accent-ink', '--bg-surface')).toBeGreaterThan(contraste('--accent', '--bg-surface'));
  });

  it('los tres son del mismo tono (248), no tres azules distintos', () => {
    for (const t of ['--accent', '--accent-fuerte', '--accent-ink']) {
      const valor = resolveToken(TOKENS, t);
      const m = valor.match(/^oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
      expect(m, `${t} debería declararse en oklch para comparar el tono: "${valor}"`).toBeTruthy();
      expect(parseFloat(m![1]), `${t} no es del tono 248`).toBe(248);
    }
  });
});

describe('nadie escribe el acento como tinta sobre el cromo', () => {
  const FUENTES = [
    'src/components/BottomPanel/BOMTab.css',
    'src/components/BottomPanel/GradingTab.css',
    'src/components/LayerPanel/LayerPanel.css',
    'src/components/Viewport3D/AvatarPanel.css',
    'src/components/Viewport3D/CollisionBodyPanel.css',
    'src/components/Viewport3D/SnapshotBar.css',
    'src/components/Viewport3D/SurfaceModePill.css',
  ];

  it.each(FUENTES)('%s usa --accent-ink para el texto, no --accent', (ruta) => {
    const css = readFileSync(join(process.cwd(), ruta), 'utf8');
    // `(?<![-\w])color:` para no confundir `border-color` ni `accent-color`
    // con `color`: un BORDE sí puede usar --accent, lo que no puede es la tinta.
    const malos = [...css.matchAll(/^.*(?<![-\w])color:\s*var\(--accent\)\s*;.*$/gm)].map((m) => m[0].trim());
    expect(malos, 'el acento como color de texto: el rol para tinta es --accent-ink').toEqual([]);
  });
});
```

- [ ] **Paso 6: Actualizar `cotas-contraste.test.ts:123-129`**

```ts
describe('F5 — arreglar la cota no puede cambiar la selección por descuido', () => {
  // La selección y las costuras cambiaron de valor UNA vez, a propósito, el
  // 26-09 (cromo callado, spec § 4.3): --accent-2d es ahora alias del acento
  // del cromo, a L 0,60 (3,43:1 sobre el crema; antes 2,70:1). Cualquier otro
  // cambio pasa por aquí.
  it('--accent-2d es el acento del cromo, tono 248 a L 0,60', () => {
    expect(token('--accent-2d')).toBe('oklch(0.60 0.16 248)');
  });
```
(el resto del bloque, «la familia de cotas es del mismo tono», queda igual.)

- [ ] **Paso 7: Correr los tests de tokens y los que los leen**

```bash
npx vitest run src/styles src/components/PatternEditor/cotas src/components/PatternEditor/renderers/__tests__/HintText.legibilidad.test.tsx src/components/Viewport3D/__tests__/acento-unico-en-el-cromo.test.ts src/components/shell/__tests__/Dock.jerarquiaDeEstado.test.ts
npx tsx scripts/contraste-tokens.ts
```
Esperado: todo en verde; la tabla del script sin «✗» y `--accent resuelve a oklch(0.60 0.16 248) = #0584da`.

- [ ] **Paso 8: Trinquete, baseline y commit**

```bash
node scripts/ui-contract-lint.mjs          # R3 bajó (App.css −8, RenderSettingsPanel −1), R4 bajó a 1, nada subió
node scripts/ui-contract-lint.mjs --update
npx tsc -b --noEmit && npx eslint src/styles scripts/contraste-tokens.ts src/components/PatternEditor/cotas/__tests__/cotas-contraste.test.ts
git add -A && git commit -m "feat(ui): la piel «cromo callado» en tokens.css — grafito tono 80, acento 248, sin blur (F1, spec § 4)"
```

### Tarea 8: Tipografía — Inter única, mono solo para datos, sin 700

**Files:**
- Create: `src/styles/__tests__/tipografia-del-cromo.test.ts`
- Modify: `index.html:10`; `src/styles/reset.css` (regla nueva tras la línea 16); `src/styles/unified-bar.css:221, :231, :234`; `src/components/shell/Dock.css:38-45, :118-124, :192-199`; `src/styles/layout.css:27`; `src/components/PatternEditor/ToolStrip2D.css:80`; `src/components/PatternEditor/EmptyState2D.css:38, :65, :77, :110`; `src/copilot/connections/DynamicProviderForm.tsx:53`; `src/copilot/AgentSettings.tsx:136`; `src/components/shell/UnifiedBarChat.tsx:310`; `src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx:274`; `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx:117`; `src/components/PatternEditor/renderers/ConstructionOverlay.tsx:80, :115`; `src/copilot/connections/ConnectionCard.tsx:68`

- [ ] **Paso 1: El test que falla**

`src/styles/__tests__/tipografia-del-cromo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Spec 2026-09-24 «cromo callado» § 4.5 (decisión D3 de Samuel):
 *   1. una sola sans (Inter) en 400/500/600 y una sola mono (JetBrains Mono);
 *      Schibsted Grotesk y el 700 salen de index.html;
 *   2. sin Inter 700 cargada, un `font-weight: 700` se sintetiza (negrita
 *      falsa): no puede quedar ninguno en el cromo;
 *   3. mono = un dato cuya alineación carácter a carácter significa algo
 *      (contrato § 5). La prosa va en sans. Este test lista, selector a
 *      selector, dónde es legal la mono en CSS.
 */
const lee = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
const rastreados = (patron: string) =>
  execFileSync('git', ['ls-files', patron], { encoding: 'utf8' }).split('\n').filter(Boolean);

describe('1. las familias que se cargan', () => {
  const html = lee('index.html');
  it('Inter 400/500/600 y JetBrains Mono 400/500, nada más', () => {
    expect(html).toContain('family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
    expect(html).not.toContain('Schibsted');
    expect(html).not.toMatch(/Inter:wght@[^"]*700/);
  });
});

describe('2. ningún 700 en el cromo', () => {
  const archivos = [
    ...rastreados('src/styles/*.css'),
    ...rastreados('src/components/shell/*.css'),
    ...rastreados('src/components/shell/*.tsx').filter((f) => !/__tests__|\.test\./.test(f)),
    'src/copilot/connections/ConnectionCard.tsx',
  ];
  it.each(archivos)('%s no declara font-weight 700 ni bold', (ruta) => {
    const sitios = [...lee(ruta).matchAll(/font-?[wW]eight:\s*['"]?(700|bold)\b/g)].map((m) => m[0]);
    expect(sitios, `${ruta}: sin Inter 700 esto se sintetiza; usa var(--weight-semibold)`).toEqual([]);
  });
});

describe('3. la mono solo viste datos', () => {
  /** Dónde es legal `var(--font-mono)` / `var(--font-mono-2d)` en CSS. `*` = todo el archivo. */
  const PERMITIDOS: Record<string, string[] | '*'> = {
    'src/styles/base.css': ['.mono'],
    'src/styles/floating.css': ['.logo-menu__shortcut', '.context-menu__shortcut'],
    'src/styles/unified-bar.css': ['.chat-markdown code'],
    'src/components/shared/SubMenu.css': ['.submenu-shortcut'],
    'src/components/shell/ToolTooltip.css': ['.tool-tooltip-shortcut'],
    'src/components/shell/Dock.css': ['.dock-picker__kbd'],
    'src/components/PatternEditor/ToolStrip2D.css': ['.tool-strip__shortcut'],
    'src/components/PatternEditor/cotas/cotas.css': '*',
  };
  const css = rastreados('src/**/*.css');
  it.each(css)('%s: cada regla con mono está en la lista', (ruta) => {
    const permitido = PERMITIDOS[ruta];
    if (permitido === '*') return;
    const sinComentarios = lee(ruta).replace(/\/\*[\s\S]*?\*\//g, '');
    const malos: string[] = [];
    for (const m of sinComentarios.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/font-family:\s*var\(--font-mono(-2d)?\)/.test(m[2])) continue;
      for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!(permitido ?? []).includes(sel)) malos.push(sel);
      }
    }
    expect(malos, `${ruta}: mono en prosa. Si es un dato (kbd, número), añade el selector a PERMITIDOS; si es prosa, usa var(--font-sans)`).toEqual([]);
  });
});
```

- [ ] **Paso 2: Verlo fallar** — `npx vitest run src/styles/__tests__/tipografia-del-cromo.test.ts` → FAIL en index.html (Schibsted), en `unified-bar.css`/`Dock.css` (700) y en `Dock.css`, `layout.css`, `ToolStrip2D.css`, `EmptyState2D.css` (mono en prosa).

- [ ] **Paso 3: Las ediciones**

`index.html:10`:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

`src/styles/reset.css`, después de la línea 16 (`::selection …`):
```css
/* Dígitos que se comparan entre sí van alineados (spec 2026-09-24 § 4.5). */
.num, input[type="number"], kbd, .readout { font-variant-numeric: tabular-nums; }
```

`src/styles/unified-bar.css`:
```css
/* :221 */   font-weight: var(--weight-semibold);
/* :231 */ .chat-markdown strong { color: var(--text-primary); font-weight: var(--weight-semibold); }
/* :234 */   font-family: var(--font-mono);
```

`src/components/shell/Dock.css`:
```css
/* :38-45 — el rótulo «2D» es prosa, no dato */
.dock__label {
  font-family: var(--font-sans);
  font-size: var(--text-1);
  font-weight: var(--weight-medium);
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 2px 0 4px;
}
/* :119 */   font-family: var(--font-sans);
/* :193 */   font-family: var(--font-sans);
```

`src/styles/layout.css:27`: borrar la línea `font-family: var(--font-mono);` de `.top-bar__status`.

`src/components/PatternEditor/ToolStrip2D.css:80`:
```css
.tool-strip__valor { font-family: var(--font-sans); font-variant-numeric: tabular-nums; font-size: var(--text-sm); color: var(--text-secondary); }
```

`src/components/PatternEditor/EmptyState2D.css` :38, :65, :77, :110: `font-family: var(--font-mono-2d);` → `font-family: var(--font-ui-2d);`.

`src/copilot/connections/DynamicProviderForm.tsx:53`, `src/copilot/AgentSettings.tsx:136`: `fontFamily: "'SF Mono', 'Fira Code', monospace",` → `fontFamily: 'var(--font-mono)',`. `src/components/shell/UnifiedBarChat.tsx:310`: `<span style={{ fontFamily: 'var(--font-mono)' }}>{tc.name}</span>`.

`SlashAndSpreadOverlay.tsx:274`, `CalibrationOverlay.tsx:117`, `ConstructionOverlay.tsx:80` y `:115`: `fontFamily="monospace"` → `fontFamily="var(--font-mono-2d)"`.

`src/copilot/connections/ConnectionCard.tsx:68`: `fontWeight: 700,` → `fontWeight: 600,`.

- [ ] **Paso 4: Verlo pasar y correr lo vecino**

```bash
npx vitest run src/styles/__tests__/tipografia-del-cromo.test.ts src/components/shell src/components/PatternEditor/__tests__ src/copilot
```

- [ ] **Paso 5: Commit**

```bash
npx tsc -b --noEmit && npx eslint $(git diff --name-only | grep -E '\.tsx?$') && node scripts/ui-contract-lint.mjs
git add -A && git commit -m "feat(ui): Inter única, una mono para datos, sin 700 (F1, spec § 4.5)"
```

### Tarea 9: El dock — radios concéntricos, sin sombra, sin segundo acento

**Files:**
- Modify: `src/components/shell/Dock.css` (3-33, 63-75, 118-127, 155-157, 162-176, 178-191, 197, 209, 219); `src/components/PatternEditor/PatternEditor.tsx:94-99`; `tests/e2e/superficies-por-accion.spec.ts` (`DOCK_ANCHO`)
- Test: `src/components/shell/__tests__/Dock.jerarquiaDeEstado.test.ts` (existe), `src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx` (existe), `tests/e2e/superficies-por-accion.spec.ts` («el dock mide lo que DOCK_WIDTH_PX dice»)

- [ ] **Paso 1: Cambiar primero el espejo e2e para que falle por la razón correcta**

En `tests/e2e/superficies-por-accion.spec.ts`: `const DOCK_ANCHO = 62;` (14 de `left` + 4 de padding + 38 de botón + 4 de padding + 2 de borde). Correr `npx playwright test tests/e2e/superficies-por-accion.spec.ts -g "DOCK_WIDTH_PX"` → FAIL (mide 68).

- [ ] **Paso 2: `Dock.css`**

```css
/* :11-17 */
  gap: 5px;
  padding: 4px;
  /* Material `chrome`: va acoplado a la canaleta, así que es opaco y sin
     sombra. Radio 10 = 6 del botón + 4 de padding (radios concéntricos,
     spec 2026-09-24 § 4.4): es el único sitio con --radius-lg. */
  background: var(--surface-chrome-bg);
  border: var(--surface-chrome-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--surface-chrome-shadow);

/* :71 (.dock__tool) */   border-radius: var(--radius-sm);
/* :123 */   color: var(--text-tertiary);
/* :126-127 */
.dock__tool--auto { color: var(--ai); }
.dock__tool--auto:hover { color: var(--ai); background: var(--bg-elevated); }
/* :155 — el hover cambia tinta o borde, nunca escala ni brillo (spec § 4.4) */
.dock__badge:hover { border-color: var(--accent); }
/* :156-157 — un icono de 15 px escrito con el acento va en su rol de tinta */
.dock__badge--pin { color: var(--accent-ink); }
.dock__badge--auto { color: var(--ai); }
/* :170 (.dock__add) */   border-radius: var(--radius-sm);
/* :187-190 (.dock-picker) — es un flyout: material overlay entero, por token */
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow);
/* :197 */   color: var(--text-tertiary);
/* :209 (.dock-picker__item) */   border-radius: var(--radius-sm);
/* :219 */ .dock-picker__check { width: 12px; color: var(--accent-ink); }
```

- [ ] **Paso 3: `PatternEditor.tsx:94-99`**

```ts
/** Faja del dock 2D izquierdo, medida en navegador (no calculada): `.dock--left`
 *  da `x=14, ancho=48` — el borde derecho cae en 62. Los 48 salen de
 *  `Dock.css`: 4px de padding + 38px de icono + 4px de padding + 1px de
 *  `--surface-chrome-border` a cada lado (2px). Hasta el 26-09 el padding era
 *  7 y la faja 68. Lo mide `superficies-por-accion.spec.ts` contra su espejo
 *  `DOCK_ANCHO`. Exportada para que el test de `handleZoomToFit` use el mismo
 *  valor en vez de repetirlo. */
export const DOCK_WIDTH_PX = 62;
```

- [ ] **Paso 4: Verlo pasar**

```bash
npx vitest run src/components/shell/__tests__/Dock.jerarquiaDeEstado.test.ts src/components/PatternEditor/__tests__/PatternEditor.fitViewDock.test.tsx
npx playwright test tests/e2e/superficies-por-accion.spec.ts -g "DOCK_WIDTH_PX"
```
Y mirar el dock en el navegador (`npm run dev`, 1366×768): doce herramientas y el «+» caben sin barra de scroll; el activo lleva relleno azul con icono blanco; no hay mancha de sombra a su derecha.

- [ ] **Paso 5: Commit**

```bash
npx tsc -b --noEmit && npx eslint src/components/PatternEditor/PatternEditor.tsx tests/e2e/superficies-por-accion.spec.ts && node scripts/ui-contract-lint.mjs && node scripts/ui-contract-lint.mjs --update
git add -A && git commit -m "feat(ui): dock con radios concéntricos, sin sombra y sin segundo acento; DOCK_WIDTH_PX 62 (F1)"
```

### Tarea 10: Materiales del shell — lo que flota, por token

Cada literal que copiaba el material (índigo al 10 %, sombra de 32 px, negro propio) pasa al token. `ToolTooltip.css` se reescribe entero: era el archivo con más literales del shell.

**Files:**
- Modify: `src/styles/floating.css` (:60, :69, :96, :112, :125, :139, :146, :162, :211, :233, :249, :256, :293); `src/styles/unified-bar.css` (:25-27, :39, :74-75, :101, :107, :115, :124, :125, :133-134, :162, :180, :186, :232); `src/styles/layout.css` (:39, :63); `src/styles/base.css` (:8, :9, :54); `src/components/shared/SubMenu.css` (:13, :16, :19-24, :35, :36, :38, :41); `src/components/shell/ToolTooltip.css` (entero); `src/components/shell/AppShell.tsx` (:71, :300, :313); `src/components/shell/UnifiedBar.tsx:228`; `src/copilot/connections/ConnectionCard.tsx:38`; `src/components/Viewport3D/RenderSettingsPanel.css:88`; `src/styles/__tests__/acento-legible.test.ts` (`FUENTES`)

- [ ] **Paso 1: Extender `FUENTES` en `acento-legible.test.ts` y verlo fallar**

```ts
  const FUENTES = [
    'src/components/BottomPanel/BOMTab.css',
    'src/components/BottomPanel/GradingTab.css',
    'src/components/LayerPanel/LayerPanel.css',
    'src/components/Viewport3D/AvatarPanel.css',
    'src/components/Viewport3D/CollisionBodyPanel.css',
    'src/components/Viewport3D/SnapshotBar.css',
    'src/components/Viewport3D/SurfaceModePill.css',
    // Cromo callado (26-09): el shell entero escribe el acento con --accent-ink.
    'src/styles/base.css',
    'src/styles/floating.css',
    'src/styles/unified-bar.css',
    'src/components/shell/Dock.css',
    'src/components/shell/ToolTooltip.css',
  ];
```
`npx vitest run src/styles/__tests__/acento-legible.test.ts` → FAIL en base.css (`.accent`, `.icon-btn--active`), floating.css (:69, :125), unified-bar.css (:232), ToolTooltip.css (:74).

- [ ] **Paso 2: `src/styles/floating.css`**

| línea | antes | después |
|---|---|---|
| 60 | `background: rgba(99, 102, 241, 0.1);` | `background: var(--accent-subtle);` |
| 69 | `color: var(--accent);` | `color: var(--accent-ink);` |
| 96 | `background: rgba(99, 102, 241, 0.08);` | `background: var(--border);` |
| 112 | `background: rgba(99, 102, 241, 0.1);` | `background: var(--accent-subtle);` |
| 125 | `color: var(--accent);` | `color: var(--accent-ink);` |
| 139, 146 | `color: var(--text-dim);` | `color: var(--text-tertiary);` |
| 162 | `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);` | `box-shadow: var(--surface-overlay-shadow);` |
| 211 | `border-bottom: 1px solid rgba(99, 102, 241, 0.08);` | `border-bottom: 1px solid var(--border);` |
| 233 | `background: rgba(99, 102, 241, 0.1);` | `background: var(--accent-subtle);` |
| 249 | `color: var(--text-ghost);` | `color: var(--text-tertiary);` |
| 256 | `background: rgba(99, 102, 241, 0.08);` | `background: var(--border);` |
| 293 | `color: var(--accent-hover);` | `color: var(--accent-ink);` |

- [ ] **Paso 3: `src/styles/unified-bar.css`**

| línea | antes | después |
|---|---|---|
| 25 | `opacity: 0.92;` | (borrar: el reposo se distingue por la sombra, no por un tercer gris; y la opacidad creaba un contexto de apilamiento) |
| 26-27 | `transition: border-radius 0.15s ease, background 0.18s ease,\n    box-shadow 0.18s ease, opacity 0.18s ease;` | `transition: border-radius 0.15s ease, background 0.18s ease, box-shadow 0.18s ease;` |
| 39 | `opacity: 1;` | (borrar) |
| 74 | `background: rgba(99, 102, 241, 0.1);` | `background: var(--accent-subtle);` |
| 75 | `border: 1px solid rgba(99, 102, 241, 0.2);` | `border: 1px solid var(--accent-border);` |
| 101 | `font-size: 15px;` | `font-size: var(--text-3);` |
| 107 | `color: var(--text-ghost);` | `color: var(--text-tertiary);` |
| 115 | `background: var(--accent);` (`.unified-bar__send`) | `background: var(--accent-fuerte);` (relleno primario: el paso fuerte) |
| 124 | `.unified-bar__send svg { width: 18px; height: 18px; color: #fff; }` | `.unified-bar__send svg { width: 18px; height: 18px; color: var(--on-accent); }` |
| 125 | `.unified-bar__send:hover { opacity: 0.85; }` | `.unified-bar__send:hover { background: var(--accent); }` (aclara un paso; nada de brillo) |
| 180 | `background: var(--accent);` (`.chat-message__avatar`, lleva texto de 9 px) | `background: var(--accent-fuerte);` |
| 133-134 | `font-size: 11px;\n  color: var(--text-dim);` | `font-size: var(--text-1);\n  color: var(--text-tertiary);` |
| 162 | `box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);` | `box-shadow: var(--surface-overlay-shadow);` |
| 186 | `color: white;` | `color: var(--on-accent);` |
| 232 | `.chat-markdown a { color: var(--accent); text-decoration: underline; }` | `.chat-markdown a { color: var(--accent-ink); text-decoration: underline; }` |

- [ ] **Paso 4: `layout.css`, `base.css`, `SubMenu.css`, `RenderSettingsPanel.css:88`**

`layout.css:39`: `background: #f5f3f0; /* Warm paper … */` → `background: var(--canvas-2d); /* un solo papel: el del lienzo */`. `layout.css:63`: `background: rgba(99, 102, 241, 0.08);` → `background: var(--accent-subtle);`.

`base.css:8-9`: `.ghost { color: var(--text-tertiary); }` y `.accent { color: var(--accent-ink); }`. `base.css:54`: `.icon-btn--active { background: var(--accent-subtle); color: var(--accent-ink); border: 1px solid var(--accent-border); }`.

`SubMenu.css`:
```css
/* :13 */ .submenu-trigger-btn:hover { background: var(--accent-subtle); }
/* :16 */ .submenu-arrow { color: var(--text-tertiary); font-size: 11px; margin-left: 12px; }
/* :17-26 — material overlay entero, por token (antes copiaba el bloque a mano) */
.submenu-panel {
  min-width: 180px;
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  box-shadow: var(--surface-overlay-shadow); padding: 6px; z-index: calc(var(--z-context-menu) + 10);
  font-family: var(--font-sans); font-size: var(--text-sm); color: var(--text-primary);
}
/* :35 */ .submenu-item:hover:not(:disabled) { background: var(--accent-subtle); }
/* :36 */ .submenu-item:disabled { color: var(--text-disabled); cursor: default; }
/* :38 */   font-size: var(--text-xs); color: var(--text-tertiary); margin-left: 12px;
/* :41 */ .submenu-separator { height: 1px; background: var(--border); margin: 4px 10px; }
```

`RenderSettingsPanel.css:88`: `color: var(--accent-hover);` → `color: var(--accent-ink);`.

- [ ] **Paso 5: `src/components/shell/ToolTooltip.css` entero**

```css
.tool-tooltip-wrapper {
  position: relative;
}

/* Material `overlay` entero, por token: flota y se va. Hasta el 26-09 traía su
   propio negro (#1a1a1a), su borde (#3a3a3a), su sombra y 'SF Mono' a mano:
   nueve literales en el archivo más chico del shell. */
.tool-tooltip {
  position: fixed;
  z-index: var(--z-tooltip);
  background: var(--surface-overlay-bg);
  border: var(--surface-overlay-border);
  border-radius: var(--surface-overlay-radius);
  padding: 8px 12px;
  min-width: 120px;
  max-width: 240px;
  box-shadow: var(--surface-overlay-shadow);
  pointer-events: none;
  white-space: nowrap;
}

/* ─── Left: tooltip appears to the left of the button ─── */
.tool-tooltip.tooltip-left {
  transform: translateY(-50%) translateX(-100%);
  animation: tooltipSlideLeft 0.1s ease;
}

@keyframes tooltipSlideLeft {
  from { opacity: 0; transform: translateY(-50%) translateX(calc(-100% + 4px)); }
  to   { opacity: 1; transform: translateY(-50%) translateX(-100%); }
}

/* ─── Right: tooltip appears to the right of the button ─── */
.tool-tooltip.tooltip-right {
  transform: translateY(-50%);
  animation: tooltipSlideRight 0.1s ease;
}

@keyframes tooltipSlideRight {
  from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
  to   { opacity: 1; transform: translateY(-50%) translateX(0); }
}

/* ─── Content ─── */
.tool-tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-tooltip-name {
  font-size: var(--text-3);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  font-family: var(--font-sans);
}

/* La tecla es un dato: mono. */
.tool-tooltip-shortcut {
  font-size: var(--text-1);
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.tool-tooltip-desc {
  font-size: var(--text-1);
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.4;
  white-space: normal;
  font-family: var(--font-sans);
}
.tool-tooltip-desc--pin { color: var(--accent-ink); }
.tool-tooltip-desc--auto { color: var(--ai); }

.tool-tooltip-hint {
  font-size: var(--text-1);
  color: var(--text-tertiary);
  margin-top: 4px;
  font-style: italic;
  font-family: var(--font-sans);
}
```

- [ ] **Paso 6: Los tres sitios en TSX**

`AppShell.tsx:71`: `color: 'var(--text-ghost)'` → `color: 'var(--text-tertiary)'`. `AppShell.tsx:300`: `background: 'rgba(99, 102, 241, 0.12)',` → `background: 'var(--accent-subtle)',`. `AppShell.tsx:313`: `boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',` → `boxShadow: 'var(--surface-overlay-shadow)',`. `UnifiedBar.tsx:228`: `background: 'rgba(99, 102, 241, 0.14)',` → `background: 'var(--accent-subtle)',`. `ConnectionCard.tsx:38`: `background: 'rgba(99, 102, 241, 0.08)',` → `background: 'var(--accent-subtle)',`.

- [ ] **Paso 7: Verlo pasar**

```bash
npx vitest run src/styles src/components/shell src/components/shared src/copilot
node scripts/ui-contract-lint.mjs      # R3 baja ≈ 30 en esta tarea; R5 no sube (ningún :hover nuevo)
```
En el navegador (1366×768, patrón cargado): menú del logo, menú contextual, tooltip del dock y paleta comparten fondo, línea de pelo y sombra corta; la barra de IA ya no cambia de gris al enfocarla, solo de sombra.

- [ ] **Paso 8: Commit**

```bash
npx tsc -b --noEmit && npx eslint $(git diff --name-only | grep -E '\.tsx?$') && node scripts/ui-contract-lint.mjs --update
git add -A && git commit -m "feat(ui): lo que flota usa el material por token — menús, tooltip, paleta, barra (F1, spec § 4.4)"
```

### Tarea 11: Los sitios pequeños — paneles, diálogos, toasts, estado vacío

Los consumidores que quedan de `--text-ghost`, `--text-dim`, `--accent-hover`, `--ai-2d`, y los literales sueltos de semánticos y acento. Sin esto la Tarea 13 no puede retirar los alias.

**Files:**
- Create: `src/components/shell/__tests__/ConfirmDialog.rellenos.test.ts`
- Modify: `src/components/PropertiesPanel/PropertiesPanel.css` (:15, :316, :387, :423, :477, :493); `src/components/shell/ConfirmDialog.css` (:68, :102-103, :108-109, :115-116, :121-122); `src/components/PatternEditor/NotchPrecisionModal.css` (:64, :87-91); `src/copilot/AgentSettings.tsx:154`; `src/copilot/connections/ConnectionsList.tsx:43`; `src/copilot/connections/ConnectionModal.tsx:79`; `src/copilot/connections/ConnectionCard.tsx:65`; `src/components/Viewport3D/SnapshotBar.css:93`; `src/components/LayerPanel/LayerPanel.css:54`; `src/components/BottomPanel/InspectorTab.css:129-130`; `src/components/Debug/SolverMetrics.css:41`; `src/components/shell/ToastContainer.css:50-54`; `src/components/PatternEditor/EmptyState2D.css` (:119, :128); `src/components/shell/UnifiedBarChat.tsx` (:245, :304, :345); `src/components/shell/UnifiedBarCommands.tsx` (:46, :66, :69, :79); `src/components/Viewport3D/renderSections/ResolutionSection.tsx:75`

- [ ] **Paso 1: El test que falla — los rellenos con texto usan el paso fuerte**

`src/components/shell/__tests__/ConfirmDialog.rellenos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un relleno que lleva texto blanco encima usa el paso FUERTE de su familia
 * (spec 2026-09-24 § 4.3): --accent da 3,95:1 con blanco y --destructive
 * 3,96:1; los pasos fuertes dan 5,04 y 6,05. El diálogo de confirmación es la
 * última pantalla antes de perder algo: es donde más importa leer el botón.
 */
const CSS = readFileSync(join(process.cwd(), 'src/components/shell/ConfirmDialog.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function regla(sel: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].split(',').map((s) => s.trim()).includes(sel)) return m[2];
  }
  return '';
}
const prop = (cuerpo: string, nombre: string) =>
  (cuerpo.match(new RegExp(`(?:^|;)\\s*${nombre}\\s*:\\s*([^;]+)`)) ?? [])[1]?.trim() ?? '';

describe('ConfirmDialog — los botones con texto blanco llevan el paso fuerte', () => {
  it('el primario', () => {
    expect(prop(regla('.confirm-dialog__btn--primary'), 'background')).toBe('var(--accent-fuerte)');
    expect(prop(regla('.confirm-dialog__btn--primary'), 'color')).toBe('var(--on-accent)');
  });
  it('el destructivo', () => {
    expect(prop(regla('.confirm-dialog__btn--destructive'), 'background')).toBe('var(--destructive-fuerte)');
  });
  it('el hover aclara un paso, no oscurece ni brilla', () => {
    expect(prop(regla('.confirm-dialog__btn--primary:hover'), 'background')).toBe('var(--accent)');
    expect(prop(regla('.confirm-dialog__btn--destructive:hover'), 'background')).toBe('var(--destructive)');
  });
});
```
`npx vitest run src/components/shell/__tests__/ConfirmDialog.rellenos.test.ts` → FAIL (hoy `var(--accent)` / `var(--destructive)`).

- [ ] **Paso 2: Las ediciones**

`ConfirmDialog.css`:
```css
/* :68 */   color: var(--text-tertiary);
/* :101-105 */
.confirm-dialog__btn--primary {
  background: var(--accent-fuerte);
  border-color: var(--accent-fuerte);
  color: var(--on-accent);
}
/* :107-110 — aclara al pasar el mouse, como --destructive-hover */
.confirm-dialog__btn--primary:hover {
  background: var(--accent);
  border-color: var(--accent);
}
/* :114-118 */
.confirm-dialog__btn--destructive {
  background: var(--destructive-fuerte);
  border-color: var(--destructive-fuerte);
  color: var(--on-accent);
}
/* :120-123 */
.confirm-dialog__btn--destructive:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}
```

`PropertiesPanel.css`: `:15` `color: var(--text-tertiary);` · `:316` `.panel-link-mode--symmetry { color: var(--accent-ink); }` · `:387` `.panel-tension-tag--ease { color: var(--accent-ink); }` · `:423` `border-color: var(--accent);` · `:477` `border: 1px dashed var(--border);` · `:493` `color: var(--text-tertiary);`.

`NotchPrecisionModal.css:64`, `SnapshotBar.css:93`: `color: var(--text-tertiary);`. `LayerPanel.css:54`: `.layer-context-menu button:disabled { color: var(--text-disabled); cursor: not-allowed; }`.

`NotchPrecisionModal.css:87-91` (el botón «Colocar» lleva texto blanco: paso fuerte):
```css
.notch-precision-actions button.primary {
  background: var(--accent-fuerte);
  border-color: var(--accent-fuerte);
  color: var(--on-accent);
}
```

Los cuatro botones de acento del copiloto (texto blanco encima; F4 los llevará a una hoja CSS, pero hoy se leen a 3,95:1): `src/copilot/AgentSettings.tsx:154`, `src/copilot/connections/ConnectionsList.tsx:43`, `src/copilot/connections/ConnectionModal.tsx:79` y `src/copilot/connections/ConnectionCard.tsx:65`: `background: 'var(--accent)',` → `background: 'var(--accent-fuerte)',`. (`AvatarPanel.css:263` es el pomo de un slider, sin texto: se queda con `--accent`.)

`InspectorTab.css:129-130`:
```css
  background: var(--accent-fuerte);
  color: var(--on-accent);
```

`SolverMetrics.css:41`: `background: var(--accent);`.

`ToastContainer.css:50-54`:
```css
.toast--success::before { background: var(--success); }
.toast--error::before   { background: var(--destructive); }
.toast--warning::before { background: var(--warning); }
.toast--info::before    { background: var(--accent); }
.toast--undo::before    { background: var(--accent-ink); }
```

`EmptyState2D.css:119` y `:128`: `color: var(--ai);`.

`UnifiedBarChat.tsx:245`: `color: 'var(--text-tertiary)',`; `:304` y `:345`: `color: tc.status === 'error' ? 'var(--color-error)' : 'var(--text-tertiary)',`.

`UnifiedBarCommands.tsx:46`: `textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600,` (las versalitas salen en F6); `:66`: `color: 'var(--text-tertiary)'`; `:69`: `fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--border-subtle)',`; `:79`: `color: 'var(--text-tertiary)'`.

`ResolutionSection.tsx:75`: `color: aspectRatioLocked ? 'var(--accent)' : 'var(--text-tertiary)',`.

- [ ] **Paso 3: Verlo pasar y correr lo vecino**

```bash
npx vitest run src/components/shell src/components/PropertiesPanel src/components/LayerPanel src/components/BottomPanel src/components/PatternEditor/__tests__ src/components/Viewport3D
grep -rn -e '--text-ghost' -e '--text-dim' -e '--accent-hover' -e '--dock-auto' -e '--ai-2d' src --include='*.css' --include='*.ts' --include='*.tsx' | grep -v 'src/styles/tokens.css' | grep -v __tests__
```
Esperado: tests en verde y el `grep` sin resultados (ya no queda ningún consumidor de los cinco alias).

- [ ] **Paso 4: Commit**

```bash
npx tsc -b --noEmit && npx eslint $(git diff --name-only | grep -E '\.tsx?$') && node scripts/ui-contract-lint.mjs && node scripts/ui-contract-lint.mjs --update
git add -A && git commit -m "feat(ui): paneles, diálogos y toasts por token; rellenos con texto en el paso fuerte (F1)"
```

### Tarea 12: El papel — puntos en tinta y los overlays 2D sin azul propio

**Files:**
- Create: `src/components/PatternEditor/renderers/__tests__/PuntosDelContorno.tinta.test.tsx`
- Modify: `src/components/PatternEditor/renderers/AnchorGlyph.tsx` (:4, :14-18, :39, :46, :52, :66); `src/components/PatternEditor/renderers/PuntosDelContorno.tsx:97`; `src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx` (:60, :66); `src/components/PatternEditor/renderers/ToolOverlay.tsx` (:251-252, :262, :466-467); `src/components/PatternEditor/renderers/overlays/PenToolOverlay.tsx` (:109, :161-162); `src/components/PatternEditor/renderers/overlays/ShapeToolOverlay.tsx` (:27-28); `src/components/PatternEditor/renderers/ReferenceImageLayer.tsx:65`; `src/components/PatternEditor/renderers/overlays/CalibrationOverlay.tsx:16`; `src/components/PatternEditor/renderers/overlays/MergeOverlay.tsx:59`

**Interfaces:**
- Produces: `AnchorVisualState = 'reposo' | 'idle' | 'hovered' | 'selected'` en `AnchorGlyph.tsx`. Ningún otro archivo pasa `state` a `AnchorGlyph` salvo `PuntosDelContorno` y los overlays de edición (que ya usan `idle`/`hovered`/`selected`).

- [ ] **Paso 1: El test que falla**

`src/components/PatternEditor/renderers/__tests__/PuntosDelContorno.tinta.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PuntosDelContorno from '../PuntosDelContorno';
import type { PatternPiece } from '../../../../types/types';

afterEach(cleanup);

/**
 * Spec 2026-09-24 «cromo callado» § 4.6: en reposo los puntos del contorno son
 * referencia, no mando, y van en TINTA; elegida la pieza, en el acento del
 * lienzo. Siguen siempre visibles (#1103, María [11:38]): cambia el color, no
 * la regla. Antes del 26-09 el patrón en reposo llevaba puesta la joyería de la
 * selección (#4A9EFF a mano en cada esquina de cada pieza).
 */
const pieza = {
  id: 'p', name: 'p', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1, internals: [],
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
} as unknown as PatternPiece;

function pintar(isSelected: boolean) {
  return render(
    <svg><PuntosDelContorno piece={pieza} zoom2D={1} isSelected={isSelected} mostrarPuntosDeCurva={false} /></svg>,
  );
}

describe('los puntos del contorno: tinta en reposo, acento al elegir', () => {
  it('sin elegir la pieza, se ven las cuatro esquinas (#1103) y van en tinta', () => {
    const { container } = pintar(false);
    const rects = container.querySelectorAll('[data-anchor-role="corner"] rect');
    expect(rects.length).toBe(4);
    for (const r of rects) expect(r.getAttribute('fill')).toBe('var(--ink-on-light-2)');
  });

  it('elegida la pieza, pasan al acento del lienzo', () => {
    const { container } = pintar(true);
    const rects = container.querySelectorAll('[data-anchor-role="corner"] rect');
    expect(rects.length).toBe(4);
    for (const r of rects) expect(r.getAttribute('fill')).toBe('var(--accent-2d)');
  });

  it('el halo del glifo es el blanco de la pieza, no un #fff suelto', () => {
    const { container } = pintar(false);
    expect(container.querySelector('[data-anchor-role="corner"] rect')?.getAttribute('stroke')).toBe('var(--piece-fill-2d)');
  });
});
```
Y en `AnchorGlyph.test.tsx`: línea 60 `'#6BB3FF'` → `'var(--accent-2d-fuerte)'`; línea 66 `'#4A9EFF'` → `'var(--accent-2d)'` (la 56, el dorado `#FFD700` del nodo elegido, se queda: lo buscan `estado-latente-de-edicion.spec.ts` y el replay de María).

`npx vitest run src/components/PatternEditor/renderers/__tests__/PuntosDelContorno.tinta.test.tsx src/components/PatternEditor/renderers/__tests__/AnchorGlyph.test.tsx` → FAIL.

- [ ] **Paso 2: `AnchorGlyph.tsx`**

```ts
export type AnchorVisualState = 'reposo' | 'idle' | 'hovered' | 'selected';

/* Tinta sobre el papel (spec 2026-09-24 § 4.6): en reposo el punto es una
 * referencia y va en tinta; elegida la pieza, en el acento del lienzo; bajo el
 * cursor, en su paso fuerte (seleccionado > hover > reposo, contrato § 4). El
 * nodo elegido conserva su dorado: es el color que los e2e de Q y el replay de
 * María [07-09] buscan. */
const STATE_COLOR: Record<AnchorVisualState, string> = {
  reposo: 'var(--ink-on-light-2)',
  idle: 'var(--accent-2d)',
  hovered: 'var(--accent-2d-fuerte)',
  selected: '#FFD700',
};
```
Y los cuatro `stroke="#fff"` (líneas 39, 46, 52, 66) → `stroke="var(--piece-fill-2d)"`.

`PuntosDelContorno.tsx:97`: `state="idle"` → `state={isSelected ? 'idle' : 'reposo'}`.

- [ ] **Paso 3: Los overlays**

`ToolOverlay.tsx:251-252`: `fill="var(--accent-2d)"` y `stroke="var(--piece-fill-2d)"`. `:262`: `stroke="var(--accent-2d)"`. `:466-467` (la marquesina):
```tsx
          style={{ fill: 'color-mix(in oklab, var(--accent-2d) 10%, transparent)' }}
          stroke="var(--accent-2d)"
```
(`color-mix` va en `style`, no en el atributo: un atributo de presentación no siempre parsea funciones de color; `var()` sí, y es el patrón que ya usan `TrazosLayer.tsx:58` y `EditPatternOverlay.tsx:110`.)

`PenToolOverlay.tsx:109`: `stroke="var(--accent-2d)"`. `:161-162`: `fill={i === 0 ? '#ffd700' : 'var(--accent-2d)'}` y `stroke="var(--piece-fill-2d)"`.

`ShapeToolOverlay.tsx:26-31`:
```ts
  const trazo = {
    style: { fill: 'color-mix(in oklab, var(--accent-2d) 15%, transparent)' },
    stroke: 'var(--accent-2d)',
    strokeWidth: 1.5 / zoom2D,
    strokeDasharray: `${4 / zoom2D}`,
  };
```
(el objeto se esparce en `<polygon {...trazo}>` y `<rect {...trazo}>`; `style` es una prop válida en ambos.)

`ReferenceImageLayer.tsx:65`: `stroke="var(--accent-2d)"`. `CalibrationOverlay.tsx:16`: `const color = 'var(--accent-2d)';`. `MergeOverlay.tsx:59`: `{renderHighlight(pieceIdA, 'var(--accent-2d)')}`.

- [ ] **Paso 4: Verlo pasar**

```bash
npx vitest run src/components/PatternEditor/renderers
npx playwright test tests/e2e/estado-latente-de-edicion.spec.ts tests/e2e/1103-* tests/e2e/edit-pattern-trust.spec.ts --reporter=list 2>/dev/null || npx playwright test tests/e2e/estado-latente-de-edicion.spec.ts tests/e2e/edit-pattern-trust.spec.ts --reporter=list
```
Y en el navegador con el DXF de María: las esquinas de las piezas no elegidas son grises; al clicar una pieza sus esquinas pasan a azul; la marquesina de selección se ve con relleno azul tenue.

- [ ] **Paso 5: Commit**

```bash
npx tsc -b --noEmit && npx eslint $(git diff --name-only | grep -E '\.tsx?$') && node scripts/ui-contract-lint.mjs && node scripts/ui-contract-lint.mjs --update
git add -A && git commit -m "feat(2d): puntos del contorno en tinta en reposo; los overlays usan el acento del lienzo (F1, spec § 4.6)"
```

### Tarea 13: Retirar los alias transitorios

**Files:**
- Modify: `src/styles/tokens.css` (borrar `--text-ghost`, `--text-dim`, `--accent-hover`, `--dock-auto`, `--ai-2d` y sus tres comentarios «TRANSITORIO»)

- [ ] **Paso 1: Comprobar que no queda ningún consumidor**

```bash
for t in text-ghost text-dim accent-hover dock-auto ai-2d; do echo "--$t: $(grep -rn -e "--$t" src --include='*.css' --include='*.ts' --include='*.tsx' | grep -v 'src/styles/tokens.css' | wc -l | tr -d ' ')"; done
```
Esperado: 0 en los cinco. (Si `--accent-hover` da 1, es el comentario de `App.css:18` que ya no existe tras la Tarea 7; si da más, faltó un sitio de la Tarea 10 u 11.)

- [ ] **Paso 2: Borrar las cinco declaraciones de `tokens.css`** y sus comentarios («TRANSITORIOS (se retiran…)», «TRANSITORIO: era el segundo nombre…», los dos `/* TRANSITORIO → Tarea 13 */`).

- [ ] **Paso 3: R2 sigue en 0, tests, commit**

```bash
node scripts/ui-contract-lint.mjs      # R2 = 0: ningún consumidor quedó huérfano
npx vitest run src/styles
git add src/styles/tokens.css && git commit -m "refactor(ui): retirar --text-ghost, --text-dim, --accent-hover, --dock-auto y --ai-2d (F1)"
```

### Tarea 14: Trinquete e2e de contraste del cromo

Mide el contraste REAL de cada texto del cromo contra su fondo compuesto (spec § 7 F1: «ningún texto < 4,5:1 sobre su fondo real»). Como el de superficies, es un trinquete: la línea base se fija hoy y solo baja. Deja fuera lo que no es cromo (el `<svg>` del papel, que miden los tests unitarios), lo deshabilitado y lo que está bajo un degradado.

**Files:**
- Create: `tests/e2e/helpers/contraste.ts`, `tests/e2e/contraste-del-cromo.spec.ts`, `tests/e2e/contraste-baseline.json`

**Interfaces:**
- Consumes: `abrirAppVacia`, `cargarDxfDeMaria`, `reposo`, `seleccionarPieza`, `abrirPaleta`, `abrirPanel`, `cambiarVista` (Tarea 3); `leerBaseline`/`fijarBaseline` (Tarea 3).
- Produces: `medirContraste(page): Promise<FalloDeContraste[]>`.

- [ ] **Paso 1: `tests/e2e/helpers/contraste.ts`**

```ts
import type { Page } from '@playwright/test';

export interface FalloDeContraste {
  texto: string;
  selector: string;
  color: string;
  fondo: string;
  ratio: number;
  minimo: number;
}

/**
 * Contraste real de cada texto del cromo contra su fondo COMPUESTO (los
 * fondos con alfa de todos los ancestros, uno sobre otro). El navegador hace
 * la conversión de color: un canvas de 1×1 lee cualquier sintaxis que el
 * motor entienda (`oklch()`, `color-mix()`, `rgba()`), así que si el motor no
 * entendiera la piel, aquí se vería.
 *
 * Fuera de la medida: el `<svg>` del papel (lo miden HintText.legibilidad y
 * cotas-contraste), lo deshabilitado (WCAG lo exime), lo atenuado por debajo
 * de 0,6 de opacidad (es un estado inerte), lo que está bajo un degradado
 * (fondo indeterminado) y el cromo solo de desarrollo.
 */
export async function medirContraste(page: Page): Promise<FalloDeContraste[]> {
  return page.evaluate(() => {
    const lienzo = document.createElement('canvas');
    lienzo.width = 1;
    lienzo.height = 1;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
    const aRgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const sobre = (fg: number[], alfa: number, bg: number[]) => [0, 1, 2].map((i) => fg[i] * alfa + bg[i] * (1 - alfa));

    const raiz = aRgba(getComputedStyle(document.body).backgroundColor);
    /** Fondo compuesto bajo `el`, o null si un ancestro pinta un degradado. */
    const fondoDe = (el: Element): number[] | null => {
      const capas: Array<[number, number, number, number]> = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null;
        const c = aRgba(cs.backgroundColor);
        if (c[3] > 0) capas.push(c);
        if (c[3] >= 0.999) break;
      }
      let fondo: number[] = raiz.slice(0, 3);
      for (const c of capas.reverse()) fondo = sobre(c.slice(0, 3), c[3], fondo);
      return fondo;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const opacidadDe = (el: Element) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
      return o;
    };
    const selectorDe = (el: Element) => {
      const partes: string[] = [];
      for (let n: Element | null = el, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++) {
        const clases = typeof n.className === 'string' && n.className.trim()
          ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        partes.unshift(n.tagName.toLowerCase() + clases);
      }
      return partes.join(' > ');
    };

    const fallos: Array<{ texto: string; selector: string; color: string; fondo: string; ratio: number; minimo: number }> = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.closest('svg') || el.closest('[data-superficie="dev"]')) continue;
      if (el.matches(':disabled, [aria-disabled="true"], :disabled *')) continue;
      const texto = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!texto || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || opacidadDe(el) < 0.6) continue;
      const fondo = fondoDe(el);
      if (!fondo) continue;
      const c = aRgba(cs.color);
      const tinta = sobre(c.slice(0, 3), c[3], fondo);
      const px = parseFloat(cs.fontSize);
      const peso = parseInt(cs.fontWeight, 10) || 400;
      const minimo = px >= 24 || (px >= 18.66 && peso >= 700) ? 3 : 4.5;
      const r = ratio(tinta, fondo);
      if (r < minimo) {
        fallos.push({
          texto: texto.slice(0, 40),
          selector: selectorDe(el),
          color: cs.color,
          fondo: `rgb(${fondo.map(Math.round).join(', ')})`,
          ratio: Math.round(r * 100) / 100,
          minimo,
        });
      }
    }
    return fallos;
  });
}
```

- [ ] **Paso 2: La línea base vacía `tests/e2e/contraste-baseline.json`**

```json
{
  "_doc": "Techos del trinquete de contraste del cromo (spec 2026-09-24 «cromo callado» § 7 F1): textos por debajo de 4,5:1 (3:1 si son grandes) sobre su fondo compuesto, por estado. Solo bajan: CONTRASTE_UPDATE=1 npx playwright test contraste-del-cromo. La meta es 0.",
  "meta": 0,
  "estados": {}
}
```

- [ ] **Paso 3: `tests/e2e/contraste-del-cromo.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { medirContraste } from './helpers/contraste';
import { leerBaseline, fijarBaseline } from './helpers/trinquete';
import {
  abrirAppVacia, cargarDxfDeMaria, reposo, seleccionarPieza, abrirPaleta, abrirPanel, cambiarVista,
} from './helpers/estados';

/**
 * Trinquete de contraste del cromo (spec 2026-09-24 «cromo callado» § 4.2 y
 * § 7 F1). Por estado, cuenta los textos que no llegan a AA sobre su fondo
 * real y falla si la cuenta supera el techo guardado. La meta es 0; lo que
 * hoy falla y no toca F1 (paneles de contenido) baja en F5 y F6.
 */
const BASELINE = 'tests/e2e/contraste-baseline.json';
const baseline = leerBaseline(BASELINE);
const medidas: Record<string, number> = {};

async function registrar(estado: string, page: Parameters<typeof medirContraste>[0]): Promise<void> {
  const fallos = await medirContraste(page);
  medidas[estado] = fallos.length;
  const techo = baseline.estados[estado];
  console.log(`contraste · ${estado}: ${fallos.length} texto(s) bajo AA · techo ${techo ?? '—'}`);
  for (const f of fallos) console.log(`    ${f.ratio}:1 (mín ${f.minimo}) «${f.texto}» ${f.selector} — ${f.color} sobre ${f.fondo}`);
  if (techo !== undefined) {
    expect(fallos.length, fallos.map((f) => `${f.ratio}:1 «${f.texto}» ${f.selector}`).join('\n')).toBeLessThanOrEqual(techo);
  }
}

test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  if (process.env.CONTRASTE_UPDATE) fijarBaseline(BASELINE, medidas);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirAppVacia(page);
});

test('estado vacío', async ({ page }) => {
  await registrar('estado vacío', page);
});

test('reposo con patrón', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await registrar('reposo con patrón', page);
});

test('pieza seleccionada', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await seleccionarPieza(page);
  await registrar('pieza seleccionada', page);
});

test('menú del logo', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.locator('.logo-menu__trigger').click();
  await expect(page.locator('.logo-menu')).toBeVisible();
  await registrar('menú del logo', page);
});

test('paleta abierta', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await abrirPaleta(page);
  await registrar('paleta abierta', page);
});

test('panel Propiedades', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await seleccionarPieza(page);
  await abrirPanel(page, 'Propiedades', 'Propiedades');
  await registrar('panel Propiedades', page);
});

test('panel Capas', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await abrirPanel(page, 'Capas', 'Capas');
  await registrar('panel Capas', page);
});

test('3D en reposo', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await cambiarVista(page, '3D');
  await registrar('3D en reposo', page);
});

test('el navegador entiende la piel: oklch con alfa y color-mix (Review Focus 2)', async ({ page }) => {
  await cargarDxfDeMaria(page);
  await reposo(page);
  await page.keyboard.press('z');
  const fondoActivo = await page.locator('.dock__tool--active').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fondoActivo, 'el relleno del dock activo no se parseó').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  const sutil = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.background = 'var(--accent-subtle)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).backgroundColor;
    d.remove();
    return c;
  });
  expect(sutil, '--accent-subtle (oklch con alfa) no compone').not.toMatch(/^$|rgba\(0, 0, 0, 0\)/);
});
```

- [ ] **Paso 4: Fijar la línea base y verla**

```bash
CONTRASTE_UPDATE=1 npx playwright test tests/e2e/contraste-del-cromo.spec.ts --reporter=list
cat tests/e2e/contraste-baseline.json
```
Esperado: «estado vacío», «reposo con patrón», «pieza seleccionada», «menú del logo» y «paleta abierta» en **0** (son las superficies que F1 re-viste enteras); «panel Propiedades», «panel Capas» y «3D en reposo» pueden quedar por encima de 0 (los paneles de contenido son F5; el 3D es F3). Si alguno de los cinco primeros no da 0, la lista impresa dice qué texto y qué selector: se arregla en el CSS de esa superficie (el rol de tinta que toca, § 4.2) antes de seguir, no se sube el techo.

- [ ] **Paso 5: Segunda corrida (afirma) y commit**

```bash
npx playwright test tests/e2e/contraste-del-cromo.spec.ts --reporter=list
npx eslint tests/e2e/helpers/contraste.ts tests/e2e/contraste-del-cromo.spec.ts
git add tests/e2e && git commit -m "test(e2e): trinquete de contraste del cromo por estado (F1, spec § 7)"
```

### Tarea 15: Las enmiendas escritas

Lo que el contrato y los documentos ratificados decían y ya no es verdad (spec § 6). Sin esto la próxima ráfaga vuelve a leer «translúcido con desenfoque» y lo reimplementa.

**Files:**
- Modify: `.claude/skills/contrato-de-interfaz/SKILL.md` (§ 2 líneas 58-70 y la tabla de materiales; § 5; § Verificación); `docs/reports/2026-09-04-revision-adversarial-ui.md:321`; `CLAUDE.md` (viñeta «Contrato de interfaz»)

- [ ] **Paso 1: `SKILL.md` § 2 — la tabla de materiales y el blur**

Reemplazar la tabla de § 2 (líneas 62-67) por:

```markdown
| Material | Cuándo | Tokens |
|---|---|---|
| **`chrome`** | acoplado a una canaleta; opaco; **sin sombra** | `--surface-chrome-bg`, `-border`, `-radius`, `-shadow` (= none) |
| **`overlay`** | flota de verdad sobre el documento y se va; casi opaco (0,96), línea de pelo, sombra corta en dos capas; **sin blur** | `--surface-overlay-bg`, `-border` (= `--hairline`), `-radius`, `-shadow`, `-blur` (= none) |

> **Enmienda 2026-09-26 (cromo callado, spec 2026-09-24 § 4.4):** los dos
> roles siguen existiendo y se usan enteros, pero están hechos del MISMO
> material y solo los distingue la sombra. El blur se retiró: con un fondo al
> 92 % solo desenfocaba el 8 % que se transparentaba, y a cambio creaba los
> contextos de apilamiento que recortaron `ConnectionModal` (párrafo de abajo).
> `--surface-overlay-blur` sigue existiendo como token y vale `none`, para que
> nadie lo reponga a mano. Se dice aquí para que no parezca fusión por descuido.
```

Y en el párrafo «Estas dos leyes pelean…» (línea ~88), añadir al principio: `> **Nota 2026-09-26:** ya no hay blur, así que un overlay ya NO establece contexto de apilamiento por sí mismo; lo que sigue vale para cualquier superficie que declare ` + "`transform`, `filter` u `opacity < 1`" + `. El patrón del portal sigue siendo el correcto para todo modal.`

- [ ] **Paso 2: `SKILL.md` § 5 — la regla de la mono**

Añadir como última viñeta de § 5:

```markdown
- **Mono = un dato cuya alineación carácter a carácter significa algo**
  (regla, cotas, píldora de medida, `kbd`). Toda la prosa del cromo va en
  `--font-sans`: el estado, los rótulos del dock, el estado vacío, el valor de
  una opción. Una sola familia de cada: Inter y JetBrains Mono, nada más se
  carga (`index.html`). Lo fija `tipografia-del-cromo.test.ts`, selector por
  selector. (Enmienda 2026-09-26; la revisión del 04-09 § 8 decía «Schibsted +
  mono», que no era lo que el código hacía.)
```

- [ ] **Paso 3: `SKILL.md` § Verificación — los dos trinquetes nuevos**

Tras el bloque de `npm run audit:ui`, añadir:

```markdown
Y dos trinquetes más, en navegador, con su línea base en JSON que **solo baja**
(spec 2026-09-24 § 3.4 y § 7):

```bash
npx playwright test tests/e2e/superficies-por-accion.spec.ts   # ≤ 4 componentes que aparecen o cambian por acción
npx playwright test tests/e2e/contraste-del-cromo.spec.ts      # ningún texto del cromo bajo AA sobre su fondo real
```

Una superficie nueva **declara** qué es con `data-superficie` (vocabulario en
`tests/repo/superficies-declaradas.test.ts`); sin marca, el trinquete no la ve.
Para bajar un techo: `SUPERFICIES_UPDATE=1` / `CONTRASTE_UPDATE=1` y se
commitea el JSON. Nunca se editan a mano.
```

- [ ] **Paso 4: Informe 2026-09-04 § 8 y `CLAUDE.md`**

En `docs/reports/2026-09-04-revision-adversarial-ui.md`, línea 321, tras «(Schibsted Grotesk + monoespaciada)», insertar: ` **[Enmienda 2026-09-26: la piel es Inter + JetBrains Mono para datos; Schibsted se cargaba en cuatro pesos para cuatro reglas y salió con la decisión D3 del spec «cromo callado». Y la piel sí se rediseñó: era la paleta, la mono y las sombras por defecto de un framework (brief 2026-09-24 § 1).]**`.

En `CLAUDE.md`, viñeta **Contrato de interfaz**, después de «…que corre en el hook de pre-commit.», añadir: `Desde el 2026-09-26 hay dos trinquetes más en navegador —superficies por acción (≤ 4) y contraste del cromo—, con línea base en \`tests/e2e/*-baseline.json\` que solo baja; una superficie nueva declara \`data-superficie\` o el trinquete no la cuenta.`

- [ ] **Paso 5: Commit**

```bash
git add .claude/skills/contrato-de-interfaz/SKILL.md docs/reports/2026-09-04-revision-adversarial-ui.md CLAUDE.md
git commit -m "docs(ui): enmiendas del contrato — material sin blur, regla de la mono, trinquetes de superficies y contraste"
```

### Tarea 16: Gates finales, capturas después y PR de F1

- [ ] **Paso 1: La suite entera y el linter**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui && npm run lint:contraste
```
Esperado: todo en verde; `lint:ui` muestra R3 muy por debajo de 639 (≈ 570), R4 = 1, R2 = 0, y nada subió.

- [ ] **Paso 2: Los e2e que ven lo que jsdom no ve (Review Focus 1)**

```bash
npx playwright test \
  tests/e2e/emplazamiento-modales.spec.ts tests/e2e/emplazamiento-tira.spec.ts \
  tests/e2e/emplazamiento-paneles.spec.ts tests/e2e/emplazamiento-lienzo-2d.spec.ts \
  tests/e2e/emplazamiento-imagenes-de-referencia.spec.ts tests/e2e/command-palette.spec.ts \
  tests/e2e/las-siete-puertas.spec.ts tests/e2e/cotas-de-pieza.spec.ts \
  tests/e2e/1099-modal-piquete-junto-a-la-pieza.spec.ts tests/e2e/estado-latente-de-edicion.spec.ts \
  tests/e2e/edit-pattern-trust.spec.ts tests/e2e/superficies-por-accion.spec.ts \
  tests/e2e/contraste-del-cromo.spec.ts --reporter=list
```
Si un spec de emplazamiento falla, es exactamente lo que este plan advirtió: un contexto de apilamiento que cambió al quitar el blur o la opacidad. Se lee el `test-results/` de ese spec, se localiza el ancestro, y se arregla en el CSS del componente (no se repone el blur). Todo en verde antes de seguir.

- [ ] **Paso 3: Capturas después, con build de producción**

```bash
npm run build && (npx vite preview --port 4174 --strictPort &) && sleep 3
node scripts/capturas-ui.mjs --fecha=2026-09-26 --sufijo=-f1
```
Leer con `Read` al menos `maria-1366x768--02-2d-cargado.png`, `--03-2d-pieza-seleccionada.png`, `--10-menu-logo.png`, `--11-panel-propiedades.png` y `--14-3d.png` de `docs/reports/ui-audit-2026-09-26-f1/capturas/` y compararlas con las de `ui-audit-2026-09-26/` (antes). Lo que tiene que verse: cromo gris cálido (sin azul), un solo azul en toda la pantalla (dock activo, selección, cota), sin manchas de sombra bajo el dock, menús con línea de pelo, esquinas de las piezas no elegidas en gris. Si algo se ve peor que antes, se anota en la descripción del PR con la captura: no se «arregla a ojo» fuera del plan.

- [ ] **Paso 4: PR**

```bash
git push -u origin feat/cromo-callado-f1
```
Abrir el PR «F1 · cromo callado: la piel» con base `feat/cromo-callado-f0` (GitHub la cambia a `main` cuando F0 se mezcle). En la descripción: la tabla de `lint:ui` antes/después, las dos líneas base (`superficies`, `contraste`), las capturas antes/después de 02, 03 y 10, y la lista de enmiendas de la Tarea 15. Samuel decide cuándo se mezcla; lo que se le enseña a María es F2, no esto.

---

## Fuera de este plan (y dónde vive)

- F2 (silencio en reposo: la tira monta solo con algo que decir, «Editando:» fuera, fila callada, AUTO fuera, pistas cortas, `EmptyState2D` a tres líneas) — plan propio tras la sesión con María (spec § 8).
- F3 (un solo indicador en 3D, mapas al primer frame, `--scene-3d` vía slice), F4 (barra convocada, Preferencias en el LogoMenu, `--band-bar` fuera), F5 (paneles a ras, una ranura), F6 (migrar los 141 `font-size` literales, las versalitas, retirar los alias `--text-xs…`) — un plan por fase, en ese orden, cada uno midiendo con los dos trinquetes de F0/F1.
