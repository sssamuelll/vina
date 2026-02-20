import { describe, it, expect } from 'vitest';
import { parseDXF } from '../utils/dxf/parser';
import { dxfToPatternPieces, entityToPath } from '../utils/dxf/converter';
import { generateDXFAAMA } from '../utils/dxf/exportAAMA';
import { DXFLWPolylineData, DXFSplineData, DXFLineData, DXFTextData } from '../utils/dxf/types';
import { PatternPiece } from '../types/types';

// ─── Helper: minimal DXF file builder ───

function dxf(entities: string, blocks = ''): string {
  const parts = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$INSUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER',
    '0', 'LAYER', '2', '1', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS',
  ];
  if (blocks.trim()) parts.push(...blocks.trim().split('\n'));
  parts.push('0', 'ENDSEC');
  parts.push('0', 'SECTION', '2', 'ENTITIES');
  if (entities.trim()) parts.push(...entities.trim().split('\n'));
  parts.push('0', 'ENDSEC');
  parts.push('0', 'EOF');
  return parts.join('\n');
}

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'test-piece',
    name: 'Test Piece',
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
    seamAllowance: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Parser Tests ───

describe('DXF Parser', () => {
  it('parses sections correctly', () => {
    const doc = parseDXF(dxf(''));
    expect(doc.header.get('$INSUNITS')).toBe(4);
    expect(doc.entities).toHaveLength(0);
  });

  it('parses LINE entities', () => {
    const content = dxf(`0
LINE
8
1
10
0.0
20
0.0
11
100.0
21
50.0`);
    const doc = parseDXF(content);
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].type).toBe('LINE');
    const d = doc.entities[0].data as DXFLineData;
    expect(d.x1).toBe(0);
    expect(d.y2).toBe(50);
  });

  it('parses LWPOLYLINE (open)', () => {
    const content = dxf(`0
LWPOLYLINE
8
1
90
3
70
0
10
0.0
20
0.0
10
100.0
20
0.0
10
100.0
20
100.0`);
    const doc = parseDXF(content);
    expect(doc.entities).toHaveLength(1);
    const d = doc.entities[0].data as DXFLWPolylineData;
    expect(d.closed).toBe(false);
    expect(d.vertices).toHaveLength(3);
  });

  it('parses LWPOLYLINE (closed)', () => {
    const content = dxf(`0
LWPOLYLINE
8
1
90
4
70
1
10
0.0
20
0.0
10
100.0
20
0.0
10
100.0
20
100.0
10
0.0
20
100.0`);
    const doc = parseDXF(content);
    const d = doc.entities[0].data as DXFLWPolylineData;
    expect(d.closed).toBe(true);
    expect(d.vertices).toHaveLength(4);
  });

  it('parses LWPOLYLINE with bulge', () => {
    const content = dxf(`0
LWPOLYLINE
8
1
90
2
70
0
10
0.0
20
0.0
42
0.5
10
100.0
20
0.0`);
    const doc = parseDXF(content);
    const d = doc.entities[0].data as DXFLWPolylineData;
    expect(d.vertices[0].bulge).toBeCloseTo(0.5);
    expect(d.vertices[1].bulge).toBe(0);
  });

  it('parses SPLINE entities (cubic)', () => {
    const content = dxf(`0
SPLINE
8
1
70
8
71
3
72
8
73
4
40
0.0
40
0.0
40
0.0
40
0.0
40
1.0
40
1.0
40
1.0
40
1.0
10
0.0
20
0.0
10
10.0
20
20.0
10
30.0
20
40.0
10
50.0
20
0.0`);
    const doc = parseDXF(content);
    expect(doc.entities).toHaveLength(1);
    const d = doc.entities[0].data as DXFSplineData;
    expect(d.degree).toBe(3);
    expect(d.controlPoints).toHaveLength(4);
    expect(d.knots).toHaveLength(8);
  });

  it('parses TEXT entities', () => {
    const content = dxf(`0
TEXT
8
1
10
50.0
20
50.0
40
5.0
1
Front Bodice`);
    const doc = parseDXF(content);
    expect(doc.entities).toHaveLength(1);
    const d = doc.entities[0].data as DXFTextData;
    expect(d.text).toBe('Front Bodice');
    expect(d.height).toBe(5);
  });

  it('parses BLOCK/INSERT grouping', () => {
    const blocks = `0
BLOCK
8
1
2
FrontPanel
70
0
10
0.0
20
0.0
0
LINE
8
1
10
0.0
20
0.0
11
100.0
21
100.0
0
ENDBLK
8
0`;

    const entities = `0
INSERT
8
1
2
FrontPanel
10
200.0
20
100.0
41
1.0
42
1.0
50
0.0`;

    const doc = parseDXF(dxf(entities, blocks));
    expect(doc.blocks.size).toBe(1);
    expect(doc.blocks.get('FrontPanel')).toBeDefined();
    expect(doc.blocks.get('FrontPanel')!.entities).toHaveLength(1);
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].type).toBe('INSERT');
  });

  it('maps AAMA layers correctly', () => {
    const content = dxf(`0
LINE
8
4
10
0.0
20
0.0
11
5.0
21
0.0
0
LINE
8
7
10
50.0
20
10.0
11
50.0
21
90.0
0
LWPOLYLINE
8
1
90
4
70
1
10
0.0
20
0.0
10
100.0
20
0.0
10
100.0
20
100.0
10
0.0
20
100.0`);
    const doc = parseDXF(content);
    const pieces = dxfToPatternPieces(doc);
    expect(pieces).toHaveLength(1);
    // Should have notch and grainline as internals
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    const grainlines = pieces[0].internals.filter(i => i.type === 'grainline');
    expect(notches.length).toBeGreaterThanOrEqual(1);
    expect(grainlines.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts piece name from TEXT entity', () => {
    const blocks = `0
BLOCK
8
1
2
Sleeve
70
0
10
0.0
20
0.0
0
TEXT
8
1
10
50.0
20
50.0
40
5.0
1
Right Sleeve
0
LINE
8
1
10
0.0
20
0.0
11
100.0
21
100.0
0
ENDBLK
8
0`;

    const entities = `0
INSERT
8
1
2
Sleeve
10
0.0
20
0.0`;

    const doc = parseDXF(dxf(entities, blocks));
    const pieces = dxfToPatternPieces(doc);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].name).toBe('Right Sleeve');
  });

  it('flips Y coordinates (DXF Y-up → screen Y-down)', () => {
    const content = dxf(`0
LINE
8
1
10
0.0
20
50.0
11
100.0
21
100.0`);
    const doc = parseDXF(content);
    const pieces = dxfToPatternPieces(doc);
    expect(pieces).toHaveLength(1);
    // Y values should be negated
    const outline = pieces[0].outline;
    // M command y should be -50
    expect(outline[0].values[1]).toBe(-50);
    // L command y should be -100
    expect(outline[1].values[1]).toBe(-100);
  });
});

// ─── Entity → Path conversion tests ───

describe('entityToPath', () => {
  it('converts LINE to M,L path', () => {
    const path = entityToPath({
      type: 'LINE', layer: '1',
      data: { x1: 0, y1: 0, x2: 100, y2: 50 } as DXFLineData,
    });
    expect(path).toHaveLength(2);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
  });

  it('converts closed LWPOLYLINE with Z', () => {
    const path = entityToPath({
      type: 'LWPOLYLINE', layer: '1',
      data: {
        closed: true,
        vertices: [
          { x: 0, y: 0, bulge: 0 },
          { x: 100, y: 0, bulge: 0 },
          { x: 100, y: 100, bulge: 0 },
        ],
      } as DXFLWPolylineData,
    });
    expect(path[0].type).toBe('M');
    expect(path[path.length - 1].type).toBe('Z');
  });

  it('converts LWPOLYLINE with bulge to bezier curve', () => {
    const path = entityToPath({
      type: 'LWPOLYLINE', layer: '1',
      data: {
        closed: false,
        vertices: [
          { x: 0, y: 0, bulge: 1.0 },
          { x: 100, y: 0, bulge: 0 },
        ],
      } as DXFLWPolylineData,
    });
    // Should have M then C (bezier from bulge)
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('C');
  });

  it('converts cubic SPLINE to C commands', () => {
    const path = entityToPath({
      type: 'SPLINE', layer: '1',
      data: {
        degree: 3, closed: false,
        knots: [0, 0, 0, 0, 1, 1, 1, 1],
        controlPoints: [
          { x: 0, y: 0 }, { x: 10, y: 20 },
          { x: 30, y: 40 }, { x: 50, y: 0 },
        ],
        fitPoints: [],
      } as DXFSplineData,
    });
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('C');
    expect(path[1].values).toEqual([10, 20, 30, 40, 50, 0]);
  });
});

// ─── AAMA Export Tests ───

describe('AAMA Export', () => {
  it('generates valid DXF with AAMA layers', () => {
    const dxf = generateDXFAAMA([makePiece()]);
    expect(dxf).toContain('$ACADVER');
    expect(dxf).toContain('AC1015');
    expect(dxf).toContain('$CLAYER');
    expect(dxf).toContain('EOF');
    // Numbered layers
    expect(dxf).toContain('\n2\n1\n');
    expect(dxf).toContain('\n2\n4\n');
    expect(dxf).toContain('\n2\n7\n');
  });

  it('creates BLOCK and INSERT for each piece', () => {
    const dxf = generateDXFAAMA([makePiece({ name: 'Front Panel' })]);
    expect(dxf).toContain('BLOCK');
    expect(dxf).toContain('ENDBLK');
    expect(dxf).toContain('INSERT');
    expect(dxf).toContain('Front_Panel');
  });

  it('exports BLOCK_RECORD table for R2000', () => {
    const dxf = generateDXFAAMA([makePiece()], { version: 'R2000' });
    expect(dxf).toContain('BLOCK_RECORD');
    expect(dxf).toContain('*MODEL_SPACE');
    expect(dxf).toContain('*PAPER_SPACE');
  });

  it('exports cubic bezier as SPLINE entity', () => {
    const piece = makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [10, 20, 30, 40, 50, 60] },
        { type: 'Z', values: [] },
      ],
    });
    const dxf = generateDXFAAMA([piece]);
    expect(dxf).toContain('SPLINE');
    // degree = 3
    expect(dxf).toContain('\n71\n3\n');
  });

  it('uses text height 2.5 for labels', () => {
    const dxf = generateDXFAAMA([makePiece()]);
    expect(dxf).toContain('\n40\n2.5\n');
  });

  it('handles multiple pieces', () => {
    const dxf = generateDXFAAMA([
      makePiece({ name: 'Front' }),
      makePiece({ name: 'Back' }),
    ]);
    const insertCount = (dxf.match(/\n0\nINSERT\n/g) || []).length;
    expect(insertCount).toBe(2);
  });
});

// ─── Seam Allowance in DXF Export ───

describe('AAMA Export with Seam Allowance', () => {
  it('exports CUT layer with SA offset and DRAW layer with original outline', () => {
    const piece = makePiece({
      seamAllowance: 10,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });
    const dxf = generateDXFAAMA([piece]);

    // Both layers should be present
    expect(dxf).toContain('\n8\n1\n'); // CUT layer
    expect(dxf).toContain('\n8\n8\n'); // DRAW layer

    // CUT outline should be larger (offset outward by 10mm)
    // Parse and check that CUT layer polyline has coordinates outside 0-100 range
    const doc = parseDXF(dxf);
    const allEntities = [...doc.entities];
    for (const [, block] of doc.blocks) {
      allEntities.push(...block.entities);
    }

    const cutEntities = allEntities.filter(e => e.layer === '1' && (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE'));
    const drawEntities = allEntities.filter(e => e.layer === '8' && (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE'));

    expect(cutEntities.length).toBeGreaterThan(0);
    expect(drawEntities.length).toBeGreaterThan(0);

    // CUT vertices should extend beyond the 0-100 range (SA offset)
    if (cutEntities[0].vertices) {
      const xs = cutEntities[0].vertices.map((v: any) => v.x);
      const hasOffset = xs.some((x: number) => x < -1 || x > 101);
      expect(hasOffset).toBe(true);
    }
  });

  it('uses same outline for CUT and DRAW when seamAllowance is 0', () => {
    const piece = makePiece({ seamAllowance: 0 });
    const dxf = generateDXFAAMA([piece]);
    const doc = parseDXF(dxf);
    const allEntities: any[] = [];
    for (const [, block] of doc.blocks) {
      allEntities.push(...block.entities);
    }
    const cutPolys = allEntities.filter(e => e.layer === '1' && e.type === 'LWPOLYLINE');
    const drawPolys = allEntities.filter(e => e.layer === '8' && e.type === 'LWPOLYLINE');
    // Both should exist and have same vertex count
    expect(cutPolys.length).toBe(drawPolys.length);
  });
});

// ─── Round-trip Test ───

describe('Round-trip: export → parse', () => {
  it('exports and re-parses a simple rectangular piece', () => {
    const original = makePiece({ name: 'RoundTrip' });
    const exported = generateDXFAAMA([original]);
    const doc = parseDXF(exported);

    // Should have blocks
    expect(doc.blocks.size).toBeGreaterThanOrEqual(1);
    // Should have INSERT in entities
    const inserts = doc.entities.filter(e => e.type === 'INSERT');
    expect(inserts.length).toBe(1);

    const pieces = dxfToPatternPieces(doc);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });
});
