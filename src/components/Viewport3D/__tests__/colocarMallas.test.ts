import { describe, it, expect } from 'vitest';
import { colocarMallas } from '../colocarMallas';
import { wrapPlacedMesh } from '../../../utils/cloth/arrangement/wrapPlacedMesh';
import { resolveArrangementWithFrames } from '../../../utils/cloth/arrangement/arrangementBinding';
import { buildAxisHints } from '../../../utils/cloth/arrangement/buildAxisHints';
import type { BodyMeasurements, PatternPiece } from '../../../types/types';
import type { MeshedPiece } from '../useMeshing';

const MEDIDAS: BodyMeasurements = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 };

const rect = (id: string, category: string) => ({
  id, name: id, category,
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 300] }, { type: 'L', values: [0, 300] }, { type: 'Z', values: [] },
  ],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [],
  createdAt: 0, updatedAt: 0, active: true,
}) as unknown as PatternPiece;

const malla = (pieceId: string): MeshedPiece => ({
  pieceId,
  vertices: new Float32Array([-0.1, 0, -0.15, 0.1, 0, -0.15, 0.1, 0, 0.15, -0.1, 0, 0.15]),
  triIds: new Int32Array([0, 1, 2, 0, 2, 3]),
  outline: [],
});

const armAxis = { left: null, right: null, ready: false };

describe('colocarMallas: lo que el solver recibe, desde un solo sitio', () => {
  const piezas = [rect('a', 'front'), rect('b', 'back')];
  const mallas = [malla('a'), malla('b')];

  it('envuelve cada malla con su marco, como el render', () => {
    const colocadas = colocarMallas(mallas, piezas, MEDIDAS, {}, armAxis);
    const marcos = resolveArrangementWithFrames(piezas, MEDIDAS, {}, { axisHints: buildAxisHints(piezas, armAxis), skeletonReady: false });
    expect(Array.from(colocadas[0].vertices)).toEqual(Array.from(wrapPlacedMesh(mallas[0].vertices, marcos[0].frame, marcos[0].wrapParams, marcos[0].flip)));
    // Cada malla con el marco de SU pieza, buscada por pieceId y no por posición:
    // también con las mallas en otro orden que las piezas (el guard de #924).
    for (const orden of [mallas, [...mallas].reverse()]) {
      const enOrden = colocarMallas(orden, piezas, MEDIDAS, {}, armAxis);
      expect(enOrden).toHaveLength(2);
      for (const c of enOrden) {
        const marco = marcos[piezas.findIndex((p) => p.id === c.pieceId)];
        const plana = orden.find((m) => m.pieceId === c.pieceId)!;
        expect(Array.from(c.vertices)).toEqual(Array.from(wrapPlacedMesh(plana.vertices, marco.frame, marco.wrapParams, marco.flip)));
      }
    }
  });

  it('respeta el orden de las mallas y deja fuera la que ya no tiene pieza', () => {
    const colocadas = colocarMallas([malla('b'), malla('borrada'), malla('a')], piezas, MEDIDAS, {}, armAxis);
    expect(colocadas.map((m) => m.pieceId)).toEqual(['b', 'a']);
  });

  it('lleva región, rigidez y presión de cada pieza', () => {
    const [a] = colocarMallas(mallas, piezas, MEDIDAS, {}, armAxis);
    expect(a.stiffnessMultiplier).toBe(1);
    expect(typeof (a as { region?: string }).region).toBe('string');
    expect((a as { pressurePa?: number }).pressurePa).toBe(0);
  });
});
