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
    // H-2: `closePanel` (por nombre) salió de la destructuración de AppShell.
    // Los botones X de ContextPanel ahora usan `closeLeft`/`closeRight` —
    // cierres sin argumentos, identidad estable — para que Escape con dos
    // paneles abiertos no dependa de qué re-render caiga entre dos listeners
    // de `window`. Ver usePanelHost.ts.
    expect(src).toMatch(/const \{ leftPanel, rightPanel, openPanel, togglePanel, closeLeft, closeRight \} = usePanelHost\(\)/);
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
  // (que cierra mucho antes que canvas-area), no en el cierre real.
  //
  // Marcador exacto `className="canvas-area__2d"` (no el bare 'canvas-area__2d'):
  // desde H-1, handleDividerMouseDown mide la región repartible con
  // `querySelector('.canvas-area__2d')` — esa llamada vive ANTES del JSX en
  // el archivo y también contiene el substring, así que un indexOf sin
  // comillas encuentra la llamada, no el elemento real.

  it('el panel izquierdo aparece antes de canvas-area__2d', () => {
    const idxLeft = src.indexOf('leftPanel &&');
    const idx2d = src.indexOf('className="canvas-area__2d"');
    expect(idxLeft).toBeGreaterThan(-1);
    expect(idx2d).toBeGreaterThan(-1);
    expect(idxLeft).toBeLessThan(idx2d);
  });

  it('el panel derecho aparece después de canvas-area__3d', () => {
    const idx3d = src.indexOf('className="canvas-area__3d"');
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
