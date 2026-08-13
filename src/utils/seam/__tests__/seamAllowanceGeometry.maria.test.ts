/**
 * Sustitución automatizada de la comprobación manual de la tanda 2c: el
 * escalón se genera sobre coordenadas del DXF real de María, no sobre el
 * rectángulo sintético de seamAllowanceGeometry.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { importDXFContent } from '../../dxf';
import { detectSemanticEdges } from '../../semanticEdges';
import { generateSeamAllowanceWithCorners } from '../cornerTypes';

const REPO_ROOT = resolve(__dirname, '../../../..');
const FIXTURE = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';

const importedPieces = importDXFContent(
  readFileSync(resolve(REPO_ROOT, FIXTURE), 'utf8'),
  { unit: 'auto', autoDetect: true },
).pieces;

const pointsOf = (commands: PathCommand[]): Point2D[] => commands
  .filter(command => command.type === 'M' || command.type === 'L')
  .map(command => ({ x: command.values[0], y: command.values[1] }));

describe('margen por tramos sobre un borde real de María', () => {
  it('forma los dos escalones perpendiculares del tramo parcial', () => {
    const piece = importedPieces.find(candidate => candidate.name === 'PATRONES PARA SAMUEL-2');
    expect(piece).toBeDefined();

    const edges = detectSemanticEdges(piece!);
    const straightEdge = edges.find(edge => edge.name === 'bottomEdge');
    expect(straightEdge).toBeDefined();
    expect(straightEdge!.segmentRange).toEqual([1, 2]);
    expect(straightEdge!.length).toBeCloseTo(227.99, 1);

    const tStart = 0.25;
    const tEnd = 0.75;
    const inheritedWidth = 10;
    const spanWidth = 20;
    const edgesWithSpan = edges.map(edge => edge.id === straightEdge!.id
      ? {
          ...edge,
          seamAllowanceSpans: [{ tStart, tEnd, width: spanWidth }],
        }
      : edge);
    const cutLine = pointsOf(generateSeamAllowanceWithCorners(
      piece!.outline,
      inheritedWidth,
      'mitered',
      {},
      edgesWithSpan,
    ));

    const startCommand = piece!.outline[0];
    const endCommand = piece!.outline[1];
    if (startCommand.type !== 'M' || endCommand.type !== 'L') {
      throw new Error('el borde recto real cambió de representación');
    }
    const startX = startCommand.values[0];
    const endX = endCommand.values[0];
    const boundaryX = (t: number) => startX + (endX - startX) * t;
    const widthJump = spanWidth - inheritedWidth;
    const hasStep = (x: number) => cutLine.some((point, index) => {
      const next = cutLine[(index + 1) % cutLine.length];
      return Math.abs(point.x - x) < 0.02
        && Math.abs(next.x - x) < 0.02
        && Math.abs(Math.abs(next.y - point.y) - widthJump) < 0.02;
    });

    expect(boundaryX(tStart)).toBeCloseTo(-32.9848, 3);
    expect(boundaryX(tEnd)).toBeCloseTo(81.0092, 3);
    expect(hasStep(boundaryX(tStart))).toBe(true);
    expect(hasStep(boundaryX(tEnd))).toBe(true);
  });
});
