/**
 * seamVisuals — lenguaje de color/error del canvas 2D (Fase 6, paridad CLO3D).
 * Un canal por concern: identidad (paleta estable por hash de id), estado
 * (peso, no recolor — vive en el renderer), error (label en mm absolutos).
 */
import { describe, it, expect } from 'vitest';
import {
  seamPairColor,
  seamMismatchMm,
  SEAM_MISMATCH_THRESHOLD_MM,
  SEAM_PALETTE,
  SEWING_PICK_FIRST,
  SEWING_PICK_SECOND,
} from '../seamVisuals';

describe('seamPairColor', () => {
  it('is deterministic and drawn from the palette', () => {
    const c = seamPairColor('seam-abc');
    expect(c).toBe(seamPairColor('seam-abc'));
    expect(SEAM_PALETTE).toContain(c);
  });

  it('is stable under neighbor deletion — the id, not the array position, decides', () => {
    // Con el cycling por índice de array, borrar el seam 0 recoloreaba a
    // TODOS los supervivientes. Con hash de id, el color de un seam no
    // depende de cuántos seams existan ni en qué orden.
    const ids = ['s-1', 's-2', 's-3', 's-4'];
    const before = ids.map(seamPairColor);
    const afterDeletion = ids.slice(1).map(seamPairColor);
    expect(afterDeletion).toEqual(before.slice(1));
  });

  it('distributes across the palette (not everything one hue)', () => {
    const colors = new Set(
      Array.from({ length: 40 }, (_, i) => seamPairColor(`seam-${i}-${i * 7}`)),
    );
    expect(colors.size).toBe(SEAM_PALETTE.length);
  });
});

describe('seamMismatchMm', () => {
  it('reports the ABSOLUTE difference in mm', () => {
    expect(seamMismatchMm(400, 419)).toBeCloseTo(19);
    expect(seamMismatchMm(419, 400)).toBeCloseTo(19);
  });

  it('threshold is 1mm (CLO3D parity) — what 5% relative got wrong both ways', () => {
    expect(SEAM_MISMATCH_THRESHOLD_MM).toBe(1);
    // 19mm en una costura lateral de 400mm: 4.75% relativo NO alertaba.
    expect(seamMismatchMm(400, 419) > SEAM_MISMATCH_THRESHOLD_MM).toBe(true);
    // 0.6mm en un tramo de 10mm: 6% relativo SÍ alertaba (falso positivo).
    expect(seamMismatchMm(10, 10.6) > SEAM_MISMATCH_THRESHOLD_MM).toBe(false);
  });
});

describe('shared sewing pick colors', () => {
  it('first is green, second is blue — one language for every sewing overlay', () => {
    expect(SEWING_PICK_FIRST).toBe('#2ecc71');
    expect(SEWING_PICK_SECOND).toBe('#3498db');
    expect(SEWING_PICK_FIRST).not.toBe(SEWING_PICK_SECOND);
  });
});
