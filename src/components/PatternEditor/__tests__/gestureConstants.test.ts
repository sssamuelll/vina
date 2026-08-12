import { describe, it, expect } from 'vitest';
import { DRAG_THRESHOLD_PX, isDrag, EDGE_HIT_PX } from '../gestureConstants';

describe('DRAG_THRESHOLD_PX', () => {
  it('vale 4 — SM_CXDRAG de Windows', () => {
    expect(DRAG_THRESHOLD_PX).toBe(4);
  });
});

describe('EDGE_HIT_PX', () => {
  it('vale 12 — el valor del spec § 7, no los 8 que la fusión del #1029 dejó', () => {
    expect(EDGE_HIT_PX).toBe(12);
  });
});

describe('isDrag', () => {
  it('3 px en un eje es clic', () => {
    expect(isDrag(3, 0)).toBe(false);
    expect(isDrag(0, -3)).toBe(false);
  });

  it('exactamente 4 px YA es arrastre (comparación >=, no >)', () => {
    expect(isDrag(4, 0)).toBe(true);
    expect(isDrag(0, 4)).toBe(true);
  });

  it('mide euclidiano, no por eje: 3,3 son 4.24 px y es arrastre', () => {
    expect(isDrag(3, 3)).toBe(true);
  });

  it('2,2 son 2.83 px y sigue siendo clic', () => {
    expect(isDrag(2, 2)).toBe(false);
  });

  it('el signo no importa', () => {
    expect(isDrag(-5, 0)).toBe(true);
    expect(isDrag(-1, -1)).toBe(false);
  });

  it('no moverse nada es clic', () => {
    expect(isDrag(0, 0)).toBe(false);
  });
});
