import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importZprj } from '../zprjImport';
import { exportZprj, type ZprjExportInput } from '../zprjExport';
import type { PatternPiece, Fabric, Avatar } from '../../../types/types';

// Minimal valid DXF with one rectangle piece on AAMA layer 1 (boundary)
const MINIMAL_DXF = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
1-Piece Boundary-1
90
4
70
1
10
0
20
0
10
100
20
0
10
100
20
100
10
0
20
100
0
ENDSEC
0
EOF`;

function makeMinimalZprj(opts: {
  dxf?: string;
  patternInfo?: object;
  avatarInfo?: object;
  fabricInfo?: object;
  projectInfo?: object;
  includeThumbnail?: boolean;
} = {}): ArrayBuffer {
  const files: Record<string, Uint8Array> = {};
  if (opts.dxf !== undefined) {
    files['pattern/pattern.dxf'] = strToU8(opts.dxf);
  } else {
    files['pattern/pattern.dxf'] = strToU8(MINIMAL_DXF);
  }
  if (opts.patternInfo) files['pattern/pattern_info.json'] = strToU8(JSON.stringify(opts.patternInfo));
  if (opts.avatarInfo) files['avatar/avatar_info.json'] = strToU8(JSON.stringify(opts.avatarInfo));
  if (opts.fabricInfo) files['fabric/fabric_info.json'] = strToU8(JSON.stringify(opts.fabricInfo));
  if (opts.projectInfo) files['project_info.json'] = strToU8(JSON.stringify(opts.projectInfo));
  if (opts.includeThumbnail) files['thumbnail.png'] = new Uint8Array([137, 80, 78, 71]); // PNG magic
  const zipped = zipSync(files);
  return zipped.buffer;
}

describe('zprj import', () => {
  it('imports minimal zprj with DXF only', async () => {
    const buf = makeMinimalZprj();
    const result = await importZprj(buf);
    expect(result.pieces.length).toBeGreaterThan(0);
    expect(result.seams).toEqual([]);
  });

  it('throws when no DXF found', async () => {
    const files: Record<string, Uint8Array> = {
      'project_info.json': strToU8('{"name":"test"}'),
    };
    const zipped = zipSync(files);
    await expect(importZprj(zipped.buffer)).rejects.toThrow('No DXF');
  });

  it('extracts project name from project_info.json', async () => {
    const buf = makeMinimalZprj({ projectInfo: { name: 'My Dress' } });
    const result = await importZprj(buf);
    expect(result.projectName).toBe('My Dress');
  });

  it('extracts avatar measurements', async () => {
    const buf = makeMinimalZprj({
      avatarInfo: { height: 175, chest: 90, waist: 70, hip: 95, unit: 'cm' },
    });
    const result = await importZprj(buf);
    expect(result.avatar?.measurements?.height).toBe(175);
    expect(result.avatar?.measurements?.hips).toBe(95);
  });

  it('extracts fabric properties', async () => {
    const buf = makeMinimalZprj({
      fabricInfo: { name: 'Silk', weight: 80, stretch: 0.1, bendStiffness: 0.2 },
    });
    const result = await importZprj(buf);
    expect(result.fabric?.name).toBe('Silk');
    expect(result.fabric?.weight).toBe(80);
    expect(result.fabric?.stiffness).toBe(0.2);
  });

  it('handles missing optional files gracefully', async () => {
    const buf = makeMinimalZprj();
    const result = await importZprj(buf);
    expect(result.avatar).toBeUndefined();
    expect(result.fabric).toBeUndefined();
    expect(result.projectName).toBeUndefined();
    expect(result.thumbnail).toBeUndefined();
  });

  it('extracts thumbnail as Blob', async () => {
    const buf = makeMinimalZprj({ includeThumbnail: true });
    const result = await importZprj(buf);
    expect(result.thumbnail).toBeInstanceOf(Blob);
  });
});

describe('zprj export', () => {
  const piece: PatternPiece = {
    id: 'p1',
    name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const avatar: Avatar = {
    id: 'av1',
    name: 'Default',
    modelUrl: '',
    measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
  };

  const fabric: Fabric = {
    id: 'f1', name: 'Cotton', color: '#fff', weight: 150, stretch: 0.05, stiffness: 0.4, friction: 0.5,
  };

  const input: ZprjExportInput = {
    pieces: [piece],
    seams: [],
    fabrics: [fabric],
    avatar,
    projectName: 'Test Project',
  };

  it('creates a valid ZIP blob', async () => {
    const blob = await exportZprj(input, { projectName: 'Test Project' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('ZIP contains expected files', async () => {
    const blob = await exportZprj(input, { projectName: 'Test Project' });
    const buf = await blob.arrayBuffer();
    const { unzipSync } = await import('fflate');
    const files = unzipSync(new Uint8Array(buf));
    expect(Object.keys(files)).toContain('pattern/pattern.dxf');
    expect(Object.keys(files)).toContain('pattern/pattern_info.json');
    expect(Object.keys(files)).toContain('avatar/avatar_info.json');
    expect(Object.keys(files)).toContain('fabric/fabric_info.json');
    expect(Object.keys(files)).toContain('project_info.json');
  });

  it('pattern_info.json has correct structure', async () => {
    const blob = await exportZprj(input, { projectName: 'Test Project' });
    const buf = await blob.arrayBuffer();
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(buf));
    const info = JSON.parse(strFromU8(files['pattern/pattern_info.json']));
    expect(info.pieces).toHaveLength(1);
    expect(info.pieces[0].name).toBe('Front');
    expect(info.pieces[0].seamAllowance).toBe(10);
  });

  it('avatar_info.json has measurements', async () => {
    const blob = await exportZprj(input, { projectName: 'Test Project' });
    const buf = await blob.arrayBuffer();
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(buf));
    const info = JSON.parse(strFromU8(files['avatar/avatar_info.json']));
    expect(info.height).toBe(180);
    expect(info.unit).toBe('cm');
  });

  it('round-trip: export then import preserves pieces', async () => {
    const blob = await exportZprj(input, { projectName: 'Test Project' });
    const buf = await blob.arrayBuffer();
    const result = await importZprj(buf);
    expect(result.pieces.length).toBeGreaterThan(0);
    expect(result.projectName).toBe('Test Project');
    expect(result.avatar?.measurements?.height).toBe(180);
  });
});
