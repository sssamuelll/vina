/**
 * Qué unidad devuelve el hit-test del margen sobre el patrón real de María.
 *
 * El importador no rellena `piece.edges`; el store llama a
 * `detectSemanticEdges` al cargar. El fixture se prepara igual para no medir
 * una puerta artificialmente cerrada.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PatternPiece, Point2D } from '../../types/types';
import { importDXFContent } from '../dxf';
import { resolveSeamAllowanceClick } from '../seam/edgeHitTest';
import { flattenPathWithSource } from '../seam';
import { detectSemanticEdges } from '../semanticEdges';

const REPO_ROOT = resolve(__dirname, '../../..');
const FIXTURE = 'tests/fixtures/garments/maria_patrones_samuel_2M.dxf';
const ZOOM_PATRON_COMPLETO = 0.53;
const MUESTRAS_POR_PIEZA = 200;

const { pieces: imported } = importDXFContent(
  readFileSync(resolve(REPO_ROOT, FIXTURE), 'utf8'),
  { unit: 'auto', autoDetect: true },
);

const pieces: PatternPiece[] = imported.map(piece => ({
  ...piece,
  edges: detectSemanticEdges(piece),
}));

function sampleAt(points: Array<Point2D & { cmd: number }>, fraction: number): Point2D {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(total);
  }
  const target = fraction * total;
  let previous = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (target > lengths[i]) {
      previous = lengths[i];
      continue;
    }
    const segmentLength = lengths[i] - previous;
    const t = segmentLength > 0 ? (target - previous) / segmentLength : 0;
    return {
      x: points[i].x + (points[i + 1].x - points[i].x) * t,
      y: points[i].y + (points[i + 1].y - points[i].y) * t,
    };
  }
  return points[points.length - 1];
}

interface PieceMeasurement {
  name: string;
  commands: number;
  edges: number;
  hits: { edge: number; vertex: number; piece: number; none: number };
  edgeRangeSizesSeen: number[];
}

function measurePiece(piece: PatternPiece): PieceMeasurement {
  const points = flattenPathWithSource(piece.outline);
  const hits = { edge: 0, vertex: 0, piece: 0, none: 0 };
  const edgeRangeSizesSeen = new Set<number>();
  for (let i = 0; i < MUESTRAS_POR_PIEZA; i++) {
    // El centro de cada intervalo evita fabricar clics exactamente sobre una
    // esquina; si gana un vértice es por su radio real, no por el muestreador.
    const local = sampleAt(points, (i + 0.5) / MUESTRAS_POR_PIEZA);
    const world = {
      x: local.x + (piece.position?.x ?? 0),
      y: local.y + (piece.position?.y ?? 0),
    };
    const target = resolveSeamAllowanceClick(
      [piece],
      world,
      10 / ZOOM_PATRON_COMPLETO,
      12 / ZOOM_PATRON_COMPLETO,
    );
    if (!target) {
      hits.none++;
      continue;
    }
    hits[target.kind]++;
    if (target.kind === 'edge') {
      const edge = piece.edges?.find(candidate => candidate.id === target.edgeId);
      if (edge) edgeRangeSizesSeen.add(edge.segmentRange[1] - edge.segmentRange[0]);
    }
  }
  return {
    name: piece.name,
    commands: piece.outline.length,
    edges: piece.edges?.length ?? 0,
    hits,
    edgeRangeSizesSeen: [...edgeRangeSizesSeen].sort((a, b) => a - b),
  };
}

describe('la unidad de selección del margen en el patrón real de María', () => {
  it('mide borde, vértice y caídas con 200 clics equidistantes por pieza', () => {
    const measurement = pieces.map(measurePiece)
      .sort((a, b) => a.name.localeCompare(b.name));
    // Cada número sale de la primera corrida sobre el fixture, no de repetir la
    // implementación en el expected. Una regresión no puede esconderse detrás
    // de "la mayoría": tiene que explicar exactamente qué pieza cambió.
    expect(measurement).toEqual([
      {
        name: 'PATRONES PARA SAMUEL-1', commands: 202, edges: 4,
        hits: { edge: 174, vertex: 26, piece: 0, none: 0 },
        edgeRangeSizesSeen: [1, 67, 127],
      },
      {
        name: 'PATRONES PARA SAMUEL-2', commands: 18, edges: 5,
        hits: { edge: 168, vertex: 32, piece: 0, none: 0 },
        edgeRangeSizesSeen: [1, 3],
      },
      {
        name: 'PATRONES PARA SAMUEL-3', commands: 194, edges: 9,
        hits: { edge: 172, vertex: 28, piece: 0, none: 0 },
        edgeRangeSizesSeen: [1, 58, 61],
      },
      {
        name: 'PATRONES PARA SAMUEL-4', commands: 202, edges: 4,
        hits: { edge: 174, vertex: 26, piece: 0, none: 0 },
        edgeRangeSizesSeen: [1, 67, 127],
      },
      {
        name: 'PATRONES PARA SAMUEL-5', commands: 276, edges: 9,
        hits: { edge: 172, vertex: 28, piece: 0, none: 0 },
        edgeRangeSizesSeen: [1, 77, 105],
      },
    ]);
  });
});
