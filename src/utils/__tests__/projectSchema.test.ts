/**
 * Tests for projectSchema — structural parser at the OpenCloProject boundary.
 *
 * Each test pins behavior the parser MUST preserve: known-good payloads pass
 * through untouched, malformed payloads are rejected with a structured error,
 * and forward-compat extras survive the round-trip. The "killer" tests at the
 * bottom (seam without pieceA, NaN, oversized arrays, javascript: data URIs)
 * are the cases that reach Redux today and either crash deeper code or
 * silently corrupt persisted state.
 */

import { describe, it, expect } from 'vitest';
import {
  parseOpenCloProject,
  parseOpenCloProjectJson,
  __testing,
} from '../projectSchema';
import type { OpenCloProject, PatternPiece } from '../../types/types';

const BASE_AVATAR = {
  id: 'avatar-1',
  name: 'Default',
  modelUrl: '/models/avatar.glb',
  measurements: {
    height: 170,
    chest: 90,
    waist: 72,
    hips: 96,
    shoulder: 40,
    armLength: 60,
    inseam: 80,
  },
};

function makePiece(id = 'piece-1'): PatternPiece {
  return {
    id,
    name: `Piece ${id}`,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function makeProject(overrides: Partial<OpenCloProject> = {}): OpenCloProject {
  return {
    id: 'proj-1',
    name: 'Untitled',
    pieces: [makePiece()],
    seams: [],
    fabrics: [
      {
        id: 'fab-1',
        name: 'Cotton',
        color: '#ffffff',
        weight: 150,
        stretch: 0.1,
        stiffness: 0.3,
        friction: 0.5,
      },
    ],
    avatar: BASE_AVATAR,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('parseOpenCloProject — happy path', () => {
  it('accepts a minimal valid project', () => {
    const r = parseOpenCloProject(makeProject());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.id).toBe('proj-1');
      expect(r.project.pieces).toHaveLength(1);
      expect(r.warnings).toEqual([]);
    }
  });

  it('accepts optional groups, poms, seamGroups, garmentInfo', () => {
    const r = parseOpenCloProject(
      makeProject({
        groups: [{ id: 'g1', name: 'Main', pieceIds: [], color: '#abc', createdAt: 1, updatedAt: 1 }],
        poms: [],
        seamGroups: [],
        garmentInfo: { brand: 'Acme', notes: 'test' },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts every InternalLineType — including the M3.5 "seam" sew-line (DXF AAMA 84)', () => {
    // Regression: the autosave of a DXF-imported project (whose pieces carry
    // 'seam' internals) was quarantined on reload because the zod enum lagged
    // behind the TS union. The boundary must accept what the importer writes.
    const types = ['dart', 'grainline', 'notch', 'fold', 'pleat', 'topstitch', 'reference', 'seam'] as const;
    const piece = {
      ...makePiece(),
      internals: types.map((type, i) => ({
        id: `il-${i}`,
        type,
        path: [
          { type: 'M' as const, values: [0, 0] },
          { type: 'L' as const, values: [5, 5] },
        ],
      })),
    };
    const r = parseOpenCloProject(makeProject({ pieces: [piece] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.pieces[0].internals).toHaveLength(types.length);
  });
});

describe('parseOpenCloProject — required field absent', () => {
  it.each([
    ['id', { id: undefined }],
    ['name', { name: undefined }],
    ['pieces', { pieces: undefined }],
    ['seams', { seams: undefined }],
    ['fabrics', { fabrics: undefined }],
    ['avatar', { avatar: undefined }],
    ['createdAt', { createdAt: undefined }],
    ['updatedAt', { updatedAt: undefined }],
  ])('rejects when %s is missing', (_name, patch) => {
    const proj = { ...makeProject(), ...patch };
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_shape');
  });
});

describe('parseOpenCloProject — wrong type for required field', () => {
  it('rejects id as number', () => {
    const r = parseOpenCloProject({ ...makeProject(), id: 42 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('id');
  });

  it('rejects pieces as object instead of array', () => {
    const r = parseOpenCloProject({ ...makeProject(), pieces: { '0': makePiece() } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('pieces');
  });

  it('rejects pieces[0].outline as string', () => {
    const bad = makeProject();
    (bad.pieces[0] as unknown as { outline: unknown }).outline = 'not-an-array';
    const r = parseOpenCloProject(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('pieces[0].outline');
  });
});

describe('parseOpenCloProject — numeric edge cases', () => {
  it('rejects NaN in piece position', () => {
    const bad = makeProject();
    bad.pieces[0].position = { x: NaN, y: 0 };
    const r = parseOpenCloProject(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('pieces[0].position.x');
  });

  it('rejects Infinity in fabric weight', () => {
    const bad = makeProject();
    bad.fabrics[0].weight = Infinity;
    const r = parseOpenCloProject(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('fabrics[0].weight');
  });

  it('accepts -0 (treated as finite)', () => {
    const proj = makeProject();
    proj.pieces[0].position = { x: -0, y: 0 };
    expect(parseOpenCloProject(proj).ok).toBe(true);
  });

  it('rejects NaN in createdAt', () => {
    const r = parseOpenCloProject({ ...makeProject(), createdAt: NaN });
    expect(r.ok).toBe(false);
  });
});

describe('parseOpenCloProject — string hardening', () => {
  it('rejects null byte in name', () => {
    const r = parseOpenCloProject({ ...makeProject(), name: 'evil\0name' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/null byte/);
  });

  it('rejects empty string for required id', () => {
    const r = parseOpenCloProject({ ...makeProject(), id: '' });
    expect(r.ok).toBe(false);
  });

  it('rejects id over MAX_ID_LEN', () => {
    const r = parseOpenCloProject({ ...makeProject(), id: 'x'.repeat(__testing.MAX_ID_LEN + 1) });
    expect(r.ok).toBe(false);
  });

  it('rejects javascript: scheme in avatar.modelUrl', () => {
    const proj = makeProject();
    proj.avatar = { ...BASE_AVATAR, modelUrl: 'javascript:alert(1)' };
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBe('avatar.modelUrl');
  });
});

describe('parseOpenCloProject — primitive and degenerate inputs', () => {
  it.each([null, undefined, 0, '', false, [], 'string', 42])('rejects %p as input', (input) => {
    const r = parseOpenCloProject(input);
    expect(r.ok).toBe(false);
  });

  it('rejects empty object', () => {
    const r = parseOpenCloProject({});
    expect(r.ok).toBe(false);
  });
});

describe('parseOpenCloProject — DoS guards', () => {
  it('rejects pieces array exceeding MAX_PIECES', () => {
    const proj = makeProject({
      pieces: Array.from({ length: __testing.MAX_PIECES + 1 }, (_, i) => makePiece(`p${i}`)),
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too_large');
  });

  it('rejects outline exceeding MAX_OUTLINE_CMDS', () => {
    const proj = makeProject();
    proj.pieces[0].outline = Array.from({ length: __testing.MAX_OUTLINE_CMDS + 1 }, () => ({
      type: 'L' as const,
      values: [0, 0],
    }));
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too_large');
  });

  it('rejects referenceImageData value exceeding MAX_DATA_URI_LEN', () => {
    const proj = makeProject({
      referenceImages: [
        {
          id: 'img-1',
          filename: 'a.png',
          width: 1,
          height: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          pixelsPerMm: null,
        },
      ],
      referenceImageData: { 'img-1': 'data:image/png;base64,' + 'a'.repeat(__testing.MAX_DATA_URI_LEN + 1) },
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(false);
  });
});

describe('parseOpenCloProject — purity', () => {
  it('does not mutate the input on success', () => {
    const proj = makeProject({
      referenceImages: [
        {
          id: 'img-1',
          filename: 'a.png',
          width: 1,
          height: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          pixelsPerMm: null,
        },
      ],
      // Both an orphan and a valid entry — filtering must not touch the input.
      referenceImageData: { 'img-1': 'data:image/png;base64,x', 'orphan': 'data:image/png;base64,y' },
    });
    const snapshot = JSON.parse(JSON.stringify(proj));
    parseOpenCloProject(proj);
    expect(proj).toEqual(snapshot);
  });

  it('does not mutate the input on failure', () => {
    const bad = { ...makeProject(), id: 42 };
    const snapshot = JSON.parse(JSON.stringify(bad));
    parseOpenCloProject(bad);
    expect(bad).toEqual(snapshot);
  });
});

describe('parseOpenCloProject — forward compatibility', () => {
  it('accepts and preserves unknown top-level fields', () => {
    const proj = { ...makeProject(), futureField: 'hello', anotherOne: 42 };
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.project as unknown as { futureField: string }).futureField).toBe('hello');
      expect((r.project as unknown as { anotherOne: number }).anotherOne).toBe(42);
    }
  });

  it('accepts and preserves unknown fields inside a piece', () => {
    const proj = makeProject();
    (proj.pieces[0] as unknown as { newProp: number }).newProp = 7;
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.project.pieces[0] as unknown as { newProp: number }).newProp).toBe(7);
    }
  });
});

describe('parseOpenCloProject — seam structural validity', () => {
  // This was a real crash path: validateAndRepairProject reads
  // seam.pieceA.pieceId without checking that pieceA exists. The parser is
  // the gate.
  it('rejects a seam without pieceA', () => {
    const bad = makeProject({
      seams: [
        {
          id: 's1',
          // pieceA missing
          pieceB: { pieceId: 'p1', edgeName: 'e' },
          type: 'standard',
          tension: 100,
          strength: 1,
          active: true,
          taped: false,
          tapeWidth: 10,
        } as unknown as OpenCloProject['seams'][number],
      ],
    });
    const r = parseOpenCloProject(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toMatch(/^seams\[0\]\.pieceA/);
  });

  it('rejects a seam where pieceA.pieceId is a number', () => {
    const bad = makeProject({
      seams: [
        {
          id: 's1',
          pieceA: { pieceId: 123 as unknown as string, edgeName: 'e' },
          pieceB: { pieceId: 'p1', edgeName: 'e' },
          type: 'standard',
          tension: 100,
          strength: 1,
          active: true,
          taped: false,
          tapeWidth: 10,
        },
      ],
    });
    const r = parseOpenCloProject(bad);
    expect(r.ok).toBe(false);
  });
});

describe('parseOpenCloProject — referenceImageData filtering', () => {
  const imageEntry = {
    id: 'img-1',
    filename: 'real.png',
    width: 100,
    height: 100,
    position: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    pixelsPerMm: null,
  };

  it('keeps a valid data:image/ URI for a known imageId', () => {
    const proj = makeProject({
      referenceImages: [imageEntry],
      referenceImageData: { 'img-1': 'data:image/png;base64,iVBOR' },
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.referenceImageData).toEqual({ 'img-1': 'data:image/png;base64,iVBOR' });
      expect(r.warnings).toEqual([]);
    }
  });

  it('drops an orphan key with a warning', () => {
    const proj = makeProject({
      referenceImages: [imageEntry],
      referenceImageData: { 'img-1': 'data:image/png;base64,a', 'orphan': 'data:image/png;base64,b' },
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.referenceImageData).toEqual({ 'img-1': 'data:image/png;base64,a' });
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].code).toBe('orphan_image_data');
    }
  });

  it('drops a non-data:image URI with a warning (text/html attempt)', () => {
    const proj = makeProject({
      referenceImages: [imageEntry],
      referenceImageData: { 'img-1': 'data:text/html,<script>alert(1)</script>' },
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.referenceImageData).toBeUndefined();
      expect(r.warnings[0].code).toBe('invalid_data_uri');
    }
  });

  it('drops a javascript: URI with a warning', () => {
    const proj = makeProject({
      referenceImages: [imageEntry],
      referenceImageData: { 'img-1': 'javascript:alert(1)' },
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings[0].code).toBe('invalid_data_uri');
    }
  });

  it('rejects forbidden __proto__ key in referenceImageData', () => {
    const proj = makeProject({
      referenceImageData: { __proto__: 'data:image/png;base64,a' },
    });
    const r = parseOpenCloProject(proj);
    // Either the key validator rejects it, or the orphan filter drops it.
    // Both are acceptable; the prototype must not pollute either way.
    if (r.ok) {
      expect(r.project.referenceImageData).toBeUndefined();
    } else {
      expect(r.error.code).toBe('invalid_shape');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('parseOpenCloProject — trim placement discriminated union', () => {
  it('accepts each valid placement mode', () => {
    const placements: NonNullable<OpenCloProject['trims']>[number]['placement'][] = [
      { mode: 'edge', edgeName: 'hem', tStart: 0, tEnd: 1 },
      { mode: 'edge-points', edgeName: 'hem', positions: [0.25, 0.75] },
      { mode: 'count', quantity: 3 },
      { mode: 'point', positions: [{ x: 0, y: 0 }] },
    ];
    for (const placement of placements) {
      const proj = makeProject({
        trims: [
          {
            id: 't1',
            pieceId: 'p1',
            type: 'button',
            name: 'B',
            description: '',
            placement,
            material: 'plastic',
            color: '#000',
            size: 10,
            unitCost: 0.05,
            active: true,
          },
        ],
      });
      const r = parseOpenCloProject(proj);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects unknown placement mode', () => {
    const proj = makeProject({
      trims: [
        {
          id: 't1',
          pieceId: 'p1',
          type: 'button',
          name: 'B',
          description: '',
          placement: { mode: 'unknown', edgeName: 'x' } as unknown as NonNullable<OpenCloProject['trims']>[number]['placement'],
          material: 'plastic',
          color: '#000',
          size: 10,
          unitCost: 0,
          active: true,
        },
      ],
    });
    const r = parseOpenCloProject(proj);
    expect(r.ok).toBe(false);
  });
});

describe('parseOpenCloProjectJson', () => {
  it('parses a valid JSON string', () => {
    const json = JSON.stringify(makeProject());
    const r = parseOpenCloProjectJson(json);
    expect(r.ok).toBe(true);
  });

  it('returns invalid_json for syntax errors', () => {
    const r = parseOpenCloProjectJson('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_json');
  });

  it('returns invalid_shape when JSON is well-formed but wrong shape', () => {
    const r = parseOpenCloProjectJson('{"id":"p","name":"n"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_shape');
  });
});

describe('isDataImageUri helper', () => {
  it.each([
    ['data:image/png;base64,a', true],
    ['data:image/svg+xml;base64,a', true],
    ['DATA:IMAGE/png;base64,a', true],
    ['data:text/html,a', false],
    ['javascript:alert(1)', false],
    ['http://example.com/x.png', false],
    ['', false],
  ])('isDataImageUri(%p) === %p', (input, expected) => {
    expect(__testing.isDataImageUri(input)).toBe(expected);
  });
});
