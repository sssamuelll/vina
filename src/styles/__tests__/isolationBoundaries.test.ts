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
  'src/components/shell/Dock.css',
];

describe('Grupo 2 — aislamiento en los archivos .css', () => {
  it.each(ARCHIVOS_CSS)('%s declara isolation: isolate', (ruta) => {
    expect(/isolation:\s*isolate/.test(leer(ruta))).toBe(true);
  });
});

/**
 * `RightDock.tsx` NO está en esta lista — caso especial, verificado con
 * `grep -n "floating-3d" src/styles/floating.css` (Task 4): el badge
 * "SIMULANDO" que RightDock.tsx monta usa la clase CSS `.floating-3d`
 * (`grep` confirma que es 1:1 — solo RightDock.tsx la usa), y su z-index
 * vive ahí, no en un `style={{}}` inline de RightDock.tsx (RightDock.tsx no
 * tiene NINGÚN zIndex propio — confirmado, 0 sitios). El aislamiento real
 * de ese sitio se verifica más abajo contra `floating.css`, con la clase
 * `.floating-3d` — no forzamos un `isolation: 'isolate'` sin z-index que
 * aislar solo para que este describe tenga una entrada por archivo.
 */
const ARCHIVOS_TSX = [
  'src/components/Viewport3D/FitMapToggle.tsx',
  'src/components/Viewport3D/PanCrosshair.tsx',
  'src/components/Viewport3D/SelectionOverlay.tsx',
  'src/components/Viewport3D/SimulationStatusOverlay.tsx',
  'src/components/Viewport3D/Viewport3D.tsx',
  'src/components/PatternEditor/FloatingActionBar.tsx',
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

/**
 * `.floating-3d` (`src/styles/floating.css`) — el sitio real de RightDock.tsx
 * (ver nota arriba). Regex acotado a la regla `.floating-3d` sola, no al
 * archivo completo: `floating.css` también tiene `.context-panel`, que
 * conserva su `z-index: 25` literal a propósito hasta Task 8/Ola 2 — el
 * mismo patrón acotado que usa Task 5 para `.canvas-area__divider`.
 */
describe('.floating-3d (RightDock) — el z-index real vive en floating.css, no en RightDock.tsx', () => {
  const css = leer('src/styles/floating.css');
  const regla = css.match(/\.floating-3d\s*\{[^}]*\}/)?.[0] ?? '';

  it('.floating-3d declara isolation: isolate', () => {
    expect(regla).toMatch(/isolation:\s*isolate/);
  });

  it('.floating-3d no tiene z-index literal', () => {
    expect(regla).not.toMatch(/z-index:\s*-?\d/);
  });
});

/**
 * Fix 3 (revisor, ronda de review de Task 4): nada atrapaba un --capa-X mal
 * escrito o borrado — `var(--capa-X)` sin su `--capa-X:` resuelve a `auto`
 * (o hereda de un ancestro, dado que nombres como `--capa-bar`/`--capa-panel`
 * se repiten sin problema entre archivos distintos — están pensados para
 * shadowear localmente) sin que ningún gate ni test lo note. Por archivo:
 * cada `var(--capa-X)` referenciada debe tener su `--capa-X:` definida en
 * ESE MISMO archivo (self-contained, o en el root que la declaró).
 */
function capaRefs(contenido: string): Set<string> {
  return new Set([...contenido.matchAll(/var\(\s*(--capa-[\w-]+)/g)].map((m) => m[1]));
}
function capaDefs(contenido: string): Set<string> {
  // CSS: `--capa-x:`; TSX (clave de objeto): `'--capa-x':` — comilla opcional.
  return new Set([...contenido.matchAll(/(--capa-[\w-]+)['"]?\s*:/g)].map((m) => m[1]));
}

describe('cada var(--capa-X) referenciada tiene su --capa-X definida en el mismo archivo', () => {
  it.each([...ARCHIVOS_CSS, ...ARCHIVOS_TSX])('%s: ninguna var(--capa-X) huérfana', (ruta) => {
    const contenido = leer(ruta);
    const refs = capaRefs(contenido);
    const defs = capaDefs(contenido);
    for (const ref of refs) {
      expect(defs.has(ref)).toBe(true);
    }
  });
});
