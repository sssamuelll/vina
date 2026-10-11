import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AppShell guarda la lista de paneles abiertos en usePanelHost(), todos a la
 * derecha (spec 2026-10-02 § 6.1, P4). La barrita de la pieza y el clic
 * derecho usan openPanel (garantiza abierto); los botones, togglePanel
 * (alternan). La asimetría es a propósito, no un bug.
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
    expect(src).toMatch(/const \{ paneles, openPanel, togglePanel, closePanel \} = usePanelHost\(\)/);
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

describe('los paneles van a la derecha (spec 2026-10-02 § 6.1)', () => {
  const src = leer();
  // Marcador exacto `className="canvas-area__3d"`: `handleDividerMouseDown`
  // también contiene el substring, en una llamada que vive antes del JSX.

  it('no queda ranura a la izquierda', () => {
    expect(src).not.toMatch(/leftPanel/);
  });

  it('el margen del 3D va detrás de los paneles y fuera de canvas-area__3d: el panel se abre entre el escenario y el margen, y el margen no se mueve', () => {
    const idx3d = src.indexOf('className="canvas-area__3d"');
    const idxPaneles = src.indexOf('[...paneles].reverse().map(');
    const idxMargen = src.indexOf('<RightDock');
    expect(idxMargen).toBeGreaterThan(idxPaneles);
    expect(src.slice(idx3d, idxPaneles), 'RightDock sigue dentro del área del 3D').not.toContain('<RightDock');
  });

  it('los paneles se pintan después de canvas-area__3d, el primero de la lista al final', () => {
    const idx3d = src.indexOf('className="canvas-area__3d"');
    const idxPaneles = src.indexOf('[...paneles].reverse().map(');
    expect(idx3d).toBeGreaterThan(-1);
    expect(idxPaneles).toBeGreaterThan(idx3d);
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
