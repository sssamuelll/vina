// @vitest-environment jsdom
/**
 * E-4 de la escalera de Escape (spec 2026-09-06 § 3): falta el peldaño 3.
 *
 * La escalera es: chip → gesto vivo → **sub-selección** → deselección global.
 * El tercer peldaño no existía en los dos editores de nodo: con un nodo o un
 * tramo seleccionado, Escape salía de la edición de golpe. María pierde el
 * modo entero cuando lo único que quería era soltar el punto que agarró.
 *
 * Un peldaño por pulsación: el primer Escape suelta la sub-selección, el
 * segundo sale. Es la misma gramática que ya usan el chip de cota
 * (`CotaChip.tsx:164`) y el borrador de margen (`tests/e2e/1100-...spec.ts`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { setup, mouseAt } from './editPatternHarness';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

const cuadrado = {
  id: 'p', name: 'Cuadrado',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false, active: true,
  seamAllowance: 0, internals: [], layer: 1, sublayer: 0, createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

function escape(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape' });
}

describe('E-4 — Escape suelta el nodo antes de salir de la edición', () => {
  it('con un nodo seleccionado, el primer Escape lo suelta y NO sale', () => {
    const { ref } = setup(cuadrado);
    // El clic COMPLETO: sin el release queda un arrastre vivo, que es el
    // peldaño 2 de la escalera y manda sobre el 3.
    act(() => ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })));
    act(() => ref.current!.handleMouseUp());
    expect(ref.current!.selectedNodes.size).toBe(1);

    act(() => ref.current!.handleKeyDown(escape()));
    expect(ref.current!.selectedNodes.size, 'el nodo debía soltarse').toBe(0);
    expect(ref.current!.isEditing, 'no debía salir de la edición todavía').toBe(true);
  });

  it('el segundo Escape, ya sin selección, sí sale', () => {
    const { ref } = setup(cuadrado);
    act(() => ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })));
    act(() => ref.current!.handleMouseUp());
    act(() => ref.current!.handleKeyDown(escape()));
    act(() => ref.current!.handleKeyDown(escape()));
    expect(ref.current!.isEditing).toBe(false);
  });

  it('sin nada seleccionado, un solo Escape sale — no se inventa un peldaño', () => {
    const { ref } = setup(cuadrado);
    expect(ref.current!.selectedNodes.size).toBe(0);
    act(() => ref.current!.handleKeyDown(escape()));
    expect(ref.current!.isEditing).toBe(false);
  });

  it('con un arrastre VIVO, Escape cancela el arrastre — el peldaño 2 gana al 3', () => {
    const { ref } = setup(cuadrado);
    act(() => ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })));
    act(() => ref.current!.handleMouseMove(mouseAt({ x: 110, y: 0 })));
    // Sin soltar: el gesto sigue abierto. Escape le pertenece a él, y quedarse
    // en el peldaño 3 dejaría el lote de deshacer abierto (`useEditPattern.undo`).
    act(() => ref.current!.handleKeyDown(escape()));
    expect(ref.current!.isEditing).toBe(false);
  });

  it('un tramo seleccionado cuenta igual que un nodo', () => {
    const { ref } = setup(cuadrado);
    // Mitad del lado de arriba: selecciona el TRAMO, no un nodo.
    act(() => ref.current!.handleMouseDown(mouseAt({ x: 50, y: 0 })));
    act(() => ref.current!.handleMouseUp());
    expect(
      ref.current!.selectedSegments.size + ref.current!.selectedNodes.size,
    ).toBeGreaterThan(0);

    act(() => ref.current!.handleKeyDown(escape()));
    expect(ref.current!.selectedSegments.size).toBe(0);
    expect(ref.current!.isEditing).toBe(true);
  });
});
