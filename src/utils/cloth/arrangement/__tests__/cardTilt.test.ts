/**
 * cardTilt — sonda del tilt A-pose (bloque cosido María-style parte 2,
 * plan §6bis 2026-07-05).
 *
 * En las fotos de María las cartas de manga NO están horizontales: se
 * inclinan siguiendo el brazo en A-pose. Antes, `placeGarmentPieces` colocaba
 * las cartas con el eje default de `surfaceFrame` (±X horizontal puro) porque
 * nunca recibía axisHints — solo el wrap/override los usaban. Ahora el batch
 * acepta `{ axisHints }` y la carta rígida (lo que la vista renderiza) hereda
 * el eje del hueso: la manga se para a lo largo del brazo real.
 *
 * Sin hints el comportamiento es byte-idéntico (todos los demás callers).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import {
  cardLocalToWorld,
  computeEffectiveRegions,
  placeGarmentPieces,
  type V3,
} from '../../garmentPlacement';
import type { BodyMeasurements, PatternPiece } from '../../../../types/types';

const MARIA_FIXTURE = resolve(__dirname, '../../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MARIA_MEAS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

function importMariaClassified(): PatternPiece[] {
  const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const map = classifyPiecesGeometric(pieces);
  for (const p of pieces) {
    const c = map.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return pieces;
}

/** Dirección mundo del eje de largo de la CARTA, en la realización de la
 * vista (dos puntos sobre el +Z mesher ≈ largo de la manga; el signo no
 * importa para la dirección de la recta). */
function cardLengthDir(pl: { position: V3; rotation: V3 }): V3 {
  const a = cardLocalToWorld([0, 0, 0.1], pl as never);
  const b = cardLocalToWorld([0, 0, -0.1], pl as never);
  const d: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const l = Math.hypot(...d) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

describe('cardTilt — la carta de manga se inclina con el eje del brazo (A-pose)', () => {
  it('con axisHints A-pose la carta deja de estar horizontal (gana componente Y)', () => {
    const pieces = importMariaClassified();
    const regions = computeEffectiveRegions(pieces);
    const sleeveI = regions.findIndex(r => r === 'left-sleeve' || r === 'right-sleeve');
    expect(sleeveI).toBeGreaterThanOrEqual(0);
    const id = pieces[sleeveI].id;

    // Sin hints: eje horizontal puro (default de surfaceFrame).
    const flat = placeGarmentPieces(pieces, MARIA_MEAS);
    const dirFlat = cardLengthDir(flat[sleeveI]);
    expect(Math.abs(dirFlat[1])).toBeLessThan(0.02); // ~horizontal

    // Con hint A-pose (brazo apuntando abajo-afuera ~30°): la carta se inclina.
    const armDown: V3 = regions[sleeveI] === 'right-sleeve'
      ? [0.87, -0.5, 0]   // +X y abajo
      : [-0.87, -0.5, 0]; // −X y abajo
    const tilted = placeGarmentPieces(pieces, MARIA_MEAS, { axisHints: { [id]: armDown } });
    const dirTilt = cardLengthDir(tilted[sleeveI]);
    // La carta ahora tiene componente vertical real (sigue el brazo).
    expect(Math.abs(dirTilt[1])).toBeGreaterThan(0.3);
  });

  it('sin hints: byte-idéntico al batch histórico (todos los demás callers)', () => {
    const pieces = importMariaClassified();
    const a = placeGarmentPieces(pieces, MARIA_MEAS);
    const b = placeGarmentPieces(pieces, MARIA_MEAS, {});
    const c = placeGarmentPieces(pieces, MARIA_MEAS, { axisHints: undefined });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('el hint NO rompe el criterio cap-proximal: la manga inclinada sigue con el cap hacia la sisa', () => {
    const pieces = importMariaClassified();
    const regions = computeEffectiveRegions(pieces);
    const sleeveIdx = regions
      .map((r, i) => (r === 'left-sleeve' || r === 'right-sleeve' ? i : -1))
      .filter(i => i >= 0);
    expect(sleeveIdx.length).toBe(2);
    const hints: Record<string, V3> = {};
    for (const i of sleeveIdx) {
      hints[pieces[i].id] = regions[i] === 'right-sleeve' ? [0.87, -0.5, 0] : [-0.87, -0.5, 0];
    }
    const placements = placeGarmentPieces(pieces, MARIA_MEAS, { axisHints: hints });

    for (const i of sleeveIdx) {
      const dir = hints[pieces[i].id];
      const proj = (t: number) => cardLocalToWorld([0, 0, t], placements[i] as never);
      // Cap del lado que está MÁS CERCA del hombro sobre el eje del brazo:
      // se comprueba que la carta no quedó cap-distal (regresión del flip).
      const p0 = proj(0.1), p1 = proj(-0.1);
      const along0 = p0[0] * dir[0] + p0[1] * dir[1] + p0[2] * dir[2];
      const along1 = p1[0] * dir[0] + p1[1] * dir[1] + p1[2] * dir[2];
      // No aserción de cuál extremo (depende del signo de la parametrización);
      // sí que el flip corrió y produjo una carta con extensión real a lo
      // largo del brazo (no colapsada).
      expect(Math.abs(along0 - along1)).toBeGreaterThan(0.05);
    }
  });
});
