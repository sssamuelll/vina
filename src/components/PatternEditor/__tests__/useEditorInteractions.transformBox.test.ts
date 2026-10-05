import { describe, it, expect } from 'vitest';
import { shouldShowActionBar, shouldShowTransformBox } from '../useEditorInteractions';

describe('shouldShowTransformBox', () => {
  it('siempre muestra para el tool transform standalone', () => {
    expect(shouldShowTransformBox({
      activeTool: 'transform', isNodeEditing: false, selectedCount: 0, selectionHasLocked: false,
    })).toBe(true);
  });

  it('oculta para transform con pieza bloqueada — era el bypass del lock (maria-204)', () => {
    expect(shouldShowTransformBox({
      activeTool: 'transform', isNodeEditing: false, selectedCount: 1, selectionHasLocked: true,
    })).toBe(false);
  });

  it('muestra en select con una pieza seleccionada, desbloqueada y sin editar nodos', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 1, selectionHasLocked: false,
    })).toBe(true);
  });

  it('oculta en altitud POINT (editando nodos) — invariante G7', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: true, selectedCount: 1, selectionHasLocked: false,
    })).toBe(false);
  });

  it('oculta cuando hay una pieza bloqueada en la selección (F8)', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 1, selectionHasLocked: true,
    })).toBe(false);
  });

  it('oculta con la selección vacía', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 0, selectionHasLocked: false,
    })).toBe(false);
  });

  // PR B, spec § 3.5: con una interna seleccionada, la pieza no compite —
  // se suprimen el box y la FloatingActionBar, que lo sigue (`shouldShowActionBar`).
  it('oculta con una interna seleccionada, aunque la pieza esté seleccionada y desbloqueada', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 1, selectionHasLocked: false,
      hasSelectedInternalLine: true,
    })).toBe(false);
  });

  it('el parámetro es opcional y por defecto no cambia el comportamiento de siempre', () => {
    expect(shouldShowTransformBox({
      activeTool: 'select', isNodeEditing: false, selectedCount: 1, selectionHasLocked: false,
    })).toBe(true);
  });
});

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
