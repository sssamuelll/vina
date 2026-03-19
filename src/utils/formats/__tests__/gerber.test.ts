import { describe, it, expect } from 'vitest';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { importGerber, parseManifest } from '../gerberImport';
import { exportGerber } from '../gerberExport';
import type { PatternPiece } from '../../../types/types';

// Minimal AAMA DXF with a rectangle on layer 1
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

function makeGerberZip(opts: {
  dxfs?: Record<string, string>;
  manifest?: string;
  extraFiles?: Record<string, Uint8Array>;
} = {}): ArrayBuffer {
  const files: Record<string, Uint8Array> = {};
  const dxfs = opts.dxfs ?? { 'pieces/FRONT.dxf': MINIMAL_DXF };
  for (const [path, content] of Object.entries(dxfs)) {
    files[path] = strToU8(content);
  }
  if (opts.manifest !== undefined) {
    files['manifest.txt'] = strToU8(opts.manifest);
  }
  if (opts.extraFiles) {
    for (const [k, v] of Object.entries(opts.extraFiles)) files[k] = v;
  }
  return zipSync(files).buffer;
}

// ─── Manifest Parser ───

describe('parseManifest', () => {
  it('parses tab-separated entries', () => {
    const text = '# comment\nFRONT\tM\tMAIN\nBACK\tL\tLINING\n';
    const entries = parseManifest(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ pieceName: 'FRONT', size: 'M', fabricType: 'MAIN' });
    expect(entries[1]).toEqual({ pieceName: 'BACK', size: 'L', fabricType: 'LINING' });
  });

  it('skips comments and empty lines', () => {
    const text = '# header\n\n  \n# another comment\nSLEEVE\tS\tMAIN\n';
    const entries = parseManifest(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].pieceName).toBe('SLEEVE');
  });

  it('handles entries with missing columns', () => {
    const text = 'FRONT\n';
    const entries = parseManifest(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ pieceName: 'FRONT', size: undefined, fabricType: undefined });
  });
});

// ─── Import ───

describe('gerber import', () => {
  it('imports multiple DXFs → correct piece count', async () => {
    const buf = makeGerberZip({
      dxfs: {
        'pieces/FRONT.dxf': MINIMAL_DXF,
        'pieces/BACK.dxf': MINIMAL_DXF,
        'pieces/SLEEVE.dxf': MINIMAL_DXF,
      },
    });
    const result = await importGerber(buf);
    expect(result.pieces).toHaveLength(3);
  });

  it('works without manifest (pieces named from filenames)', async () => {
    const buf = makeGerberZip({ dxfs: { 'pieces/COLLAR.dxf': MINIMAL_DXF } });
    const result = await importGerber(buf);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].name).toBe('COLLAR');
    expect(result.manifest).toBeUndefined();
  });

  it('parses manifest when present', async () => {
    const buf = makeGerberZip({
      dxfs: { 'pieces/FRONT.dxf': MINIMAL_DXF },
      manifest: '# Manifest\nFRONT\tM\tMAIN\n',
    });
    const result = await importGerber(buf);
    expect(result.manifest).toHaveLength(1);
    expect(result.manifest![0].pieceName).toBe('FRONT');
  });

  it('ignores .rul and .mrk files gracefully', async () => {
    const buf = makeGerberZip({
      extraFiles: {
        'rules/grading.rul': new Uint8Array([1, 2, 3]),
        'rules/marker.mrk': new Uint8Array([4, 5, 6]),
      },
    });
    const result = await importGerber(buf);
    expect(result.warnings.some(w => w.includes('.rul'))).toBe(true);
    expect(result.warnings.some(w => w.includes('.mrk'))).toBe(true);
    expect(result.pieces.length).toBeGreaterThan(0);
  });

  it('throws when no DXF files found', async () => {
    const files: Record<string, Uint8Array> = {
      'manifest.txt': strToU8('# empty'),
    };
    const buf = zipSync(files).buffer;
    await expect(importGerber(buf)).rejects.toThrow('No DXF');
  });

  it('finds DXFs in nested directories', async () => {
    const buf = makeGerberZip({
      dxfs: { 'some/nested/dir/PANEL.dxf': MINIMAL_DXF },
    });
    const result = await importGerber(buf);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].name).toBe('PANEL');
  });
});

// ─── Export ───

describe('gerber export', () => {
  const piece: PatternPiece = {
    id: 'p1',
    name: 'Front Bodice',
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('creates a valid ZIP blob', async () => {
    const blob = await exportGerber([piece], [], 'TestProject');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('ZIP contains pieces/ directory and manifest.txt', async () => {
    const blob = await exportGerber([piece], [], 'TestProject');
    const buf = await blob.arrayBuffer();
    const files = unzipSync(new Uint8Array(buf));
    const keys = Object.keys(files);
    expect(keys.some(k => k.startsWith('pieces/') && k.endsWith('.dxf'))).toBe(true);
    expect(keys).toContain('manifest.txt');
  });

  it('manifest has correct piece names', async () => {
    const blob = await exportGerber([piece, { ...piece, id: 'p2', name: 'Back Bodice' }], [], 'Test');
    const buf = await blob.arrayBuffer();
    const files = unzipSync(new Uint8Array(buf));
    const manifest = strFromU8(files['manifest.txt']);
    expect(manifest).toContain('Front Bodice');
    expect(manifest).toContain('Back Bodice');
  });
});

// ─── Round-trip ───

describe('gerber round-trip', () => {
  it('export → import preserves piece count and names', async () => {
    const pieces: PatternPiece[] = [
      {
        id: 'p1', name: 'FRONT', outline: [
          { type: 'M', values: [0, 0] }, { type: 'L', values: [50, 0] },
          { type: 'L', values: [50, 80] }, { type: 'L', values: [0, 80] },
          { type: 'Z', values: [] },
        ], internals: [], position: { x: 0, y: 0 }, rotation: 0,
        mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, createdAt: 0, updatedAt: 0,
      },
      {
        id: 'p2', name: 'BACK', outline: [
          { type: 'M', values: [0, 0] }, { type: 'L', values: [60, 0] },
          { type: 'L', values: [60, 90] }, { type: 'L', values: [0, 90] },
          { type: 'Z', values: [] },
        ], internals: [], position: { x: 0, y: 0 }, rotation: 0,
        mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, createdAt: 0, updatedAt: 0,
      },
    ];

    const blob = await exportGerber(pieces, [], 'RoundTrip');
    const buf = await blob.arrayBuffer();
    const result = await importGerber(buf);

    expect(result.pieces).toHaveLength(2);
    const names = result.pieces.map(p => p.name).sort();
    expect(names).toEqual(['BACK', 'FRONT']);
  });
});
