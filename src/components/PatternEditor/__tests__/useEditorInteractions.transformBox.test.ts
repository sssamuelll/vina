import { describe, it, expect } from 'vitest';
import { shouldShowTransformBox } from '../useEditorInteractions';

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
  // se suprimen el box Y la FloatingActionBar (comparten este mismo booleano).
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
