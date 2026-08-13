import { describe, expect, it } from 'vitest';
import type { SemanticEdge } from '../../types/types';
import { parseVinaProject } from '../projectSchema';
import { preserveEdgeWidthsByName } from '../semanticEdges';

const BASE_AVATAR = {
  id: 'avatar-1',
  name: 'Default',
  modelUrl: '/models/avatar.glb',
  measurements: {
    height: 170, chest: 90, waist: 72, hips: 96,
    shoulder: 40, armLength: 60, inseam: 80,
  },
};

function projectWithSpans(spans: unknown) {
  return {
    id: 'project-1',
    name: 'Spans',
    pieces: [{
      id: 'piece-1',
      name: 'Delantero',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      edges: [{
        id: 'piece-1:top',
        name: 'top',
        segmentRange: [1, 2],
        edgeType: 'seam',
        seamAllowanceSpans: spans,
      }],
      active: true,
      createdAt: 1,
      updatedAt: 1,
    }],
    seams: [],
    fabrics: [],
    avatar: BASE_AVATAR,
    createdAt: 1,
    updatedAt: 1,
  };
}

function expectRejected(spans: unknown, expectedPath: string) {
  const result = parseVinaProject(projectWithSpans(spans));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe('invalid_shape');
  expect(result.error.path).toContain(expectedPath);
}

describe('seamAllowanceSpans en el borde semántico', () => {
  it('sobrevive al round-trip antes y después de declarar el schema', () => {
    // Este test nace verde a propósito: `semanticEdgeSchema.loose()` ya dejaba
    // pasar el campo desconocido. C-8 corrige la premisa del plan: declararlo
    // compra VALIDACIÓN, no supervivencia.
    const spans = [{ tStart: 0.2, tEnd: 0.7, width: 18 }];
    const result = parseVinaProject(projectWithSpans(spans));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.pieces[0].edges?.[0].seamAllowanceSpans).toEqual(spans);
  });

  it('rechaza tStart fuera de [0,1]', () => {
    expectRejected([{ tStart: -0.1, tEnd: 0.5, width: 10 }], 'tStart');
  });

  it('rechaza tEnd menor o igual que tStart', () => {
    expectRejected([{ tStart: 0.6, tEnd: 0.6, width: 10 }], 'tEnd');
  });

  it('rechaza un ancho negativo', () => {
    expectRejected([{ tStart: 0.2, tEnd: 0.5, width: -1 }], 'width');
  });

  it('rechaza tramos solapados aunque lleguen desordenados', () => {
    expectRejected([
      { tStart: 0.5, tEnd: 0.9, width: 20 },
      { tStart: 0.2, tEnd: 0.6, width: 10 },
    ], 'seamAllowanceSpans');
  });

  it('conserva los tramos cuando loadProject re-detecta el borde por nombre', () => {
    // Esta es la segunda puerta de C-9: zod puede aceptar el dato y aun así
    // `preserveEdgeWidthsByName` borrarlo al reemplazar todos los bordes.
    const spans = [{ tStart: 0.2, tEnd: 0.7, width: 18 }];
    const oldEdges = [{
      id: 'old', name: 'armhole', segmentRange: [1, 4] as [number, number],
      edgeType: 'seam' as const, seamAllowanceSpans: spans,
    }];
    const newEdges: SemanticEdge[] = [{
      id: 'new', name: 'armhole', segmentRange: [2, 8], edgeType: 'seam',
    }];

    const preserved = preserveEdgeWidthsByName(oldEdges, newEdges);
    expect(preserved[0].seamAllowanceSpans).toEqual(spans);
    expect(preserved[0].id).toBe('new');
  });
});
