/**
 * cardOrientation — sonda del bloque "cosido María-style" (plan §6bis 2026-07-05).
 *
 * La CARTA rígida (arrange view: DraggablePiece/SeamRenderer3D leen
 * `resolveArrangement`) es lo que Samuel ve al coser — y sus mangas salían con
 * el cap hacia AFUERA (distal), lejos de las sisas con las que se cosen. Causa
 * doble: (a) el oráculo M4-C rígido comparaba world-Y, que no restringe cartas
 * horizontales; (b) medía con `placementLocalToWorld`, cuya composición Euler
 * DIVERGE de la que la vista realmente aplica (THREE 'XYZ' sobre local con
 * pattern-Y negado) justo en las triples de manga — modelaba una carta
 * vertical "correcta" mientras el render mostraba el cap distal. El fix mide
 * y aplica el flip EN EL ESPACIO DE LA CARTA (`cardLocalToWorld` +
 * `flipCardInPlane`) — la misma lección que el wrap ya codifica
 * (`computeWrapFlipFlags`: "the flip must be measured in the space it is
 * applied").
 *
 * Mismo pipeline de import que wrapOrientation.test.ts (las 5 piezas reales
 * de María).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveArrangement } from '../arrangementBinding';
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import {
  ANATOMY_BOTTOM_ROOTS,
  ANATOMY_TOP_ROOTS,
  anatomyLocalEndpoints,
  cardLocalToWorld,
  computeEffectiveRegions,
  flipCardInPlane,
  type PlacementResult,
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

/** Media de la proyección de los endpoints anatómicos sobre `dir`, en el
 * espacio de la CARTA (la realización de la vista). */
function meanCardProj(
  piece: PatternPiece,
  placement: PlacementResult,
  roots: Set<string>,
  dir: [number, number, number],
): number | null {
  const locals = anatomyLocalEndpoints(piece, roots);
  if (locals.length === 0) return null;
  let sum = 0;
  for (const lv of locals) {
    const w = cardLocalToWorld(lv, placement);
    sum += w[0] * dir[0] + w[1] * dir[1] + w[2] * dir[2];
  }
  return sum / locals.length;
}

describe('cardOrientation — la CARTA rígida pone el cap de manga proximal (hacia la sisa)', () => {
  it("las mangas de María: sleeveCap más cerca del cuerpo que el cuff, sobre el eje de la carta", () => {
    const pieces = importMariaClassified();
    expect(pieces.length).toBe(5);
    const regions = computeEffectiveRegions(pieces);
    // El path que la vista arrange consume (sin overrides — el batch rígido
    // nunca usa axisHints; ver resolveArrangementCore).
    const placements = resolveArrangement(pieces, MARIA_MEAS, undefined);

    const sleeveIdx = pieces
      .map((_, i) => i)
      .filter(i => regions[i] === 'left-sleeve' || regions[i] === 'right-sleeve');
    expect(sleeveIdx.length).toBe(2);

    for (const i of sleeveIdx) {
      // Dirección DISTAL de la carta = el eje default de surfaceFrame para la
      // región (izq −X, der +X). Proximal (hacia la sisa) = proyección menor.
      const distal: [number, number, number] =
        regions[i] === 'right-sleeve' ? [1, 0, 0] : [-1, 0, 0];
      const cap = meanCardProj(pieces[i], placements[i], ANATOMY_TOP_ROOTS, distal);
      const cuff = meanCardProj(pieces[i], placements[i], ANATOMY_BOTTOM_ROOTS, distal);
      expect(cap, `${pieces[i].name} tiene cap+cuff con evidencia anatómica`).not.toBeNull();
      expect(cuff, `${pieces[i].name} tiene cap+cuff con evidencia anatómica`).not.toBeNull();
      expect(cap!, `${pieces[i].name} (region ${regions[i]}) cap proximal a la sisa`).toBeLessThan(cuff!);
    }
  });

  it('las piezas verticales (torso) conservan anatomía arriba EN LA VISTA — el criterio axial no las toca', () => {
    const pieces = importMariaClassified();
    const regions = computeEffectiveRegions(pieces);
    const placements = resolveArrangement(pieces, MARIA_MEAS, undefined);

    const torsoIdx = pieces
      .map((_, i) => i)
      .filter(i => regions[i] === 'front-torso' || regions[i] === 'back-torso');
    expect(torsoIdx.length).toBeGreaterThanOrEqual(2);

    for (const i of torsoIdx) {
      const up: [number, number, number] = [0, 1, 0];
      const top = meanCardProj(pieces[i], placements[i], ANATOMY_TOP_ROOTS, up);
      const bottom = meanCardProj(pieces[i], placements[i], ANATOMY_BOTTOM_ROOTS, up);
      if (top == null || bottom == null) continue;
      expect(top, `${pieces[i].name} anatomía arriba`).toBeGreaterThan(bottom);
    }
  });

  it('flipCardInPlane es una rotación 180° in-plane real: involutiva y sin espejo', () => {
    const pieces = importMariaClassified();
    const regions = computeEffectiveRegions(pieces);
    const placements = resolveArrangement(pieces, MARIA_MEAS, undefined);
    const i = regions.findIndex(r => r === 'left-sleeve' || r === 'right-sleeve');
    expect(i).toBeGreaterThanOrEqual(0);
    const pl = placements[i];

    // Involutiva: flip(flip(rot)) realiza el mismo mapeo local→world que rot.
    const twice: PlacementResult = { ...pl, rotation: flipCardInPlane(flipCardInPlane(pl.rotation)) };
    const once: PlacementResult = { ...pl, rotation: flipCardInPlane(pl.rotation) };
    const probes: Array<[number, number, number]> = [[0.1, 0, 0.05], [-0.07, 0, 0.12], [0.03, 0, -0.09]];
    for (const p of probes) {
      const a = cardLocalToWorld(p, pl);
      const b = cardLocalToWorld(p, twice);
      for (let k = 0; k < 3; k++) expect(b[k]).toBeCloseTo(a[k], 10);
      // In-plane 180 sobre la normal: el punto flipeado coincide con el punto
      // local NEGADO en ambos ejes in-plane bajo la pose original (sin espejo).
      const c = cardLocalToWorld(p, once);
      const d = cardLocalToWorld([-p[0], p[1], -p[2]], pl);
      for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(d[k], 10);
    }
  });
});
