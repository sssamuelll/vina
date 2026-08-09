import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entityToPath, importDXFContent, parseDXF } from '../index';
import { classifyPiece } from '../../pieceClassifier';
import { generateSeamAllowanceWithCorners } from '../../seam/cornerTypes';
import { flattenPath } from '../../seam';
import { extractDarts } from '../../dartEntity';

const GARMENT_FIXTURES = resolve(__dirname, '../../../../tests/fixtures/garments');
const MARIA_FIXTURE = resolve(GARMENT_FIXTURES, 'maria_patrones_samuel_2M.dxf');
const VECTORIZER_FIXTURE = resolve(GARMENT_FIXTURES, 'vectorizer_jacket_M.dxf');

function importFixture(path: string) {
  return importDXFContent(readFileSync(path, 'utf8'), { unit: 'auto', autoDetect: true });
}

function flipPathY<T extends { type: string; values: number[] }>(path: T[]) {
  return path.map(command => ({
    type: command.type,
    values: command.values.map((value, index) => index % 2 === 1 ? -value : value),
  }));
}

describe('real CAD import contract', () => {
  it('imports María\'s production DXF with its detected format, generic classification, closed outlines, and anchored notches', () => {
    const result = importFixture(MARIA_FIXTURE);

    expect(result.format).toBe('aama');
    expect(result.formatConfidence).toBe(71);
    expect(result.pieces).toHaveLength(5);
    expect(result.pieces.map(classifyPiece)).toEqual(Array.from(
      { length: 5 },
      () => ({ category: 'other', side: 'both' }),
    ));
    expect(result.pieces.every(piece => piece.outline.at(-1)?.type === 'Z')).toBe(true);

    const notches = result.pieces.flatMap(piece => piece.internals.filter(line => line.type === 'notch'));
    expect(notches).toHaveLength(8);
    expect(notches.every(notch => notch.notchAnchor)).toBe(true);
  });

  // #1020: las líneas internas genéricas de María (rol 'draw'/'intcut') llegan
  // como 'reference', no como 'dart'. Antes entraban etiquetadas de pinza y el
  // validador avisaba sobre ellas; y `extractDarts` no saca ninguna pinza real
  // de este archivo porque cada una viene partida en piernas de 2 puntos
  // (#1021, sin resolver). Este test fija ambas mitades sobre datos reales.
  it('tipa las líneas internas de María como reference, y no produce pinzas legibles', () => {
    const pieces = importFixture(MARIA_FIXTURE).pieces;
    const internals = pieces.flatMap(piece => piece.internals);

    expect(internals.filter(line => line.type === 'reference')).toHaveLength(10);
    expect(internals.some(line => line.type === 'dart')).toBe(false);
    expect(pieces.flatMap(extractDarts)).toHaveLength(0);
  });

  it('promotes María\'s dense layer-84 curves to their parsed blocks\' imported outlines', () => {
    const content = readFileSync(MARIA_FIXTURE, 'utf8');
    const parsed = parseDXF(content);
    const importedByName = new Map(importDXFContent(content, { unit: 'auto', autoDetect: true }).pieces
      .map(piece => [piece.name, piece]));

    for (const [blockName, block] of parsed.blocks) {
      const coarseCut = block.entities.find(entity => entity.layer === '1');
      const denseQualityCurve = block.entities.find(entity => entity.layer === '84');
      if (!coarseCut || !denseQualityCurve) {
        throw new Error(`Expected cut and dense layer-84 curves in ${blockName}`);
      }

      const densePath = entityToPath(denseQualityCurve);
      expect(densePath.length).toBeGreaterThan(entityToPath(coarseCut).length);

      const imported = importedByName.get(blockName.replace(/_M$/, ''));
      expect(imported).toBeDefined();
      expect(imported!.outline).toEqual(flipPathY(densePath));
      expect(imported!.internals.some(line => line.type === 'seam')).toBe(false);
    }
  });

  it('generates a sane seam allowance on María\'s pieces — the cut line never touches the outline (maria-202)', () => {
    // CLO repeats the shared vertex where curve samples join. Those duplicates
    // STAY in the outline (they are semantic — anchorRoles reads them), but
    // buildOffsetEdges must not choke on them: pre-fix the zero-length edges
    // could not be offset and the SA band collapsed onto the outline at 6-10
    // spots per piece — the broken margin María photographed.
    const result = importFixture(MARIA_FIXTURE);
    const SA = 10;

    for (const piece of result.pieces) {
      const outline = flattenPath(piece.outline);
      const sa = generateSeamAllowanceWithCorners(piece.outline, SA, 'mitered', {});
      expect(sa.length).toBeGreaterThan(0);
      for (const p of flattenPath(sa)) {
        let best = Infinity;
        for (let i = 0; i < outline.length; i++) {
          const a = outline[i], b = outline[(i + 1) % outline.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          const t = lenSq < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
          best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
        }
        expect(best).toBeGreaterThanOrEqual(SA - 0.05);
      }
    }
  });

  it('imports the regenerated Vectorizer jacket with semantic names, closed outlines, and anchored notches', () => {
    const result = importFixture(VECTORIZER_FIXTURE);

    expect(result.format).toBe('aama');
    expect(result.pieces).toHaveLength(7);
    expect(Object.fromEntries(result.pieces.map(piece => [piece.name, classifyPiece(piece)]))).toEqual({
      'front panel left': { category: 'bodice', side: 'front' },
      'front panel right': { category: 'bodice', side: 'front' },
      'back panel': { category: 'bodice', side: 'back' },
      'sleeve left': { category: 'sleeve', side: 'left' },
      'sleeve right': { category: 'sleeve', side: 'right' },
      collar: { category: 'collar', side: 'both' },
      waistband: { category: 'waistband', side: 'both' },
    });
    expect(result.pieces.every(piece => piece.outline.at(-1)?.type === 'Z')).toBe(true);
    expect(result.pieces.flatMap(piece => piece.internals).some(line => line.type === 'dart')).toBe(false);

    for (const piece of result.pieces) {
      const notches = piece.internals.filter(line => line.type === 'notch');
      expect(notches.length).toBeGreaterThan(0);
      expect(notches.every(notch => notch.notchAnchor)).toBe(true);
    }
  });
});
