/**
 * seamVisuals — lenguaje de color/error del canvas 2D (Fase 6, paridad CLO3D).
 * Un canal por concern: identidad (paleta estable por hash de id), estado
 * (peso, no recolor — vive en el renderer), error (label en mm absolutos).
 */
import { describe, it, expect } from 'vitest';
import {
  seamPairColor,
  seamMismatchMm,
  layoutMismatchLabels,
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

  it('distributes across every available tone, with more than three identities', () => {
    const colors = new Set(
      Array.from({ length: 40 }, (_, i) => seamPairColor(`seam-${i}-${i * 7}`)),
    );
    expect(colors.size).toBeGreaterThan(3);
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

describe('layoutMismatchLabels (Fase1-H1 — anticolisión)', () => {
  const FONT = 9;
  const label = (id: string, x: number, y: number, text = '⚠ 220.7mm mismatch') => ({ id, x, y, text });

  it('leaves far-apart labels at their anchors', () => {
    const out = layoutMismatchLabels([label('a', 0, 0), label('b', 500, 500)], FONT);
    expect(out.get('a')).toEqual({ x: 0, y: 0 });
    expect(out.get('b')).toEqual({ x: 500, y: 500 });
  });

  it('stacks labels that share the same anchor so they never overlap', () => {
    // El caso del cuello post-auto-sew: tres seams anclados al mismo punto
    // se imprimían uno sobre otro hasta ser texto basura (shots 04/08).
    const out = layoutMismatchLabels(
      [label('a', 100, 100), label('b', 100, 100), label('c', 100, 100)],
      FONT,
    );
    const ys = ['a', 'b', 'c'].map(id => out.get(id)!.y).sort((p, q) => p - q);
    expect(new Set(ys).size).toBe(3);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(FONT * 1.2);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(FONT * 1.2);
  });

  it('separates labels that overlap only partially (near anchors)', () => {
    const out = layoutMismatchLabels([label('a', 100, 100), label('b', 130, 103)], FONT);
    const a = out.get('a')!;
    const b = out.get('b')!;
    // O quedaron lejos en x (no se tocan) o el layout los separó en y.
    const width = FONT * 0.62 * '⚠ 220.7mm mismatch'.length;
    const apart = Math.abs(a.x - b.x) >= width || Math.abs(a.y - b.y) >= FONT * 1.2;
    expect(apart).toBe(true);
  });

  it('is deterministic regardless of input order', () => {
    const set1 = layoutMismatchLabels([label('a', 100, 100), label('b', 100, 100)], FONT);
    const set2 = layoutMismatchLabels([label('b', 100, 100), label('a', 100, 100)], FONT);
    expect(set1.get('a')).toEqual(set2.get('a'));
    expect(set1.get('b')).toEqual(set2.get('b'));
  });
});
