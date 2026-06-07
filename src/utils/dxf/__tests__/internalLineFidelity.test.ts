/**
 * M3.5 — internal-line fidelity on DXF import.
 *
 * María's real Adidas DXF (CLO export, AAMA @43% confidence) revealed three
 * converter leaks:
 *  1. The sew/seam line (vendor layer 84, also ASTM 'SEW LINE' / Lectra
 *     'COUTURE') resolves to a role the switch skips or — worse, for
 *     unmapped '84' — lands in 'unknown' and gets GLUED onto the cut
 *     outline, corrupting it with a second overlapping contour.
 *  2. Notches/drill holes are POINT entities (layer 4) — the parser did not
 *     parse POINT at all, so every notch was silently lost.
 *  3. Construction POINTs (layers 2/3: turn/curve-fit points) must stay
 *     inert — never internals, never outline.
 */
import { describe, it, expect } from 'vitest';
import { parseDXF } from '../parser';
import { dxfToPatternPieces } from '../converter';
import { getProfile } from '../formatProfiles';

// ─── Synthetic DXF builders (same idiom as dxfImport.test.ts) ───

interface EntitySpec {
  kind: 'rect' | 'openline' | 'point';
  layer: string;
}

/** Build a flat-entities DXF with the given entity specs. */
function buildDXF(specs: EntitySpec[]): string {
  const lines: string[] = [
    '  0', 'SECTION',
    '  2', 'HEADER',
    '  0', 'ENDSEC',
    '  0', 'SECTION',
    '  2', 'ENTITIES',
  ];
  for (const s of specs) {
    if (s.kind === 'rect') {
      lines.push(
        '  0', 'LWPOLYLINE',
        '  8', s.layer,
        ' 90', '4',
        ' 70', '1', // closed
        ' 10', '0.0', ' 20', '0.0', ' 42', '0.0',
        ' 10', '100.0', ' 20', '0.0', ' 42', '0.0',
        ' 10', '100.0', ' 20', '100.0', ' 42', '0.0',
        ' 10', '0.0', ' 20', '100.0', ' 42', '0.0',
      );
    } else if (s.kind === 'openline') {
      lines.push(
        '  0', 'LWPOLYLINE',
        '  8', s.layer,
        ' 90', '2',
        ' 70', '0', // open
        ' 10', '20.0', ' 20', '50.0', ' 42', '0.0',
        ' 10', '80.0', ' 20', '50.0', ' 42', '0.0',
      );
    } else {
      lines.push(
        '  0', 'POINT',
        '  8', s.layer,
        ' 10', '50.0',
        ' 20', '25.0',
      );
    }
  }
  lines.push('  0', 'ENDSEC', '  0', 'EOF');
  return lines.join('\n');
}

/** Command count of a piece outline built from ONLY the cut rectangle above. */
function cutOnlyOutlineLength(): number {
  const doc = parseDXF(buildDXF([{ kind: 'rect', layer: '1' }]));
  return dxfToPatternPieces(doc, { formatProfile: getProfile('aama') })[0].outline.length;
}

// ─── 1. Seam-line routing ───

describe('seam-line routing', () => {
  it('AAMA layer 84 (CLO sew line) becomes a seam internal, not part of the outline', () => {
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: '1' },
      { kind: 'rect', layer: '84' },
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    // The sew line must NOT be glued onto the cut outline.
    expect(pieces[0].outline.length).toBe(cutOnlyOutlineLength());
    // It must surface as a 'seam' internal instead of being dropped.
    const seams = pieces[0].internals.filter(i => i.type === 'seam');
    expect(seams.length).toBe(1);
    expect(seams[0].path.length).toBeGreaterThan(2);
  });

  it("ASTM 'SEW LINE' layer becomes a seam internal (was: skipped)", () => {
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: 'PIECE BOUNDARY' },
      { kind: 'rect', layer: 'SEW LINE' },
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('astm') });

    expect(pieces.length).toBe(1);
    const seams = pieces[0].internals.filter(i => i.type === 'seam');
    expect(seams.length).toBe(1);
  });

  it("Lectra 'COUTURE' layer becomes a seam internal (was: skipped)", () => {
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: 'CONTOUR' },
      { kind: 'rect', layer: 'COUTURE' },
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('lectra') });

    expect(pieces.length).toBe(1);
    const seams = pieces[0].internals.filter(i => i.type === 'seam');
    expect(seams.length).toBe(1);
  });
});

// ─── 1b. Outline provenance (junta F1) ───

describe('imported outline provenance — the boundary IS the cut line', () => {
  // The DXF boundary layer is the contour the patternmaker cuts. Every
  // imported piece must carry `outlineIsCutLine: true` so the renderer never
  // offsets a synthetic seam allowance over it — even when the file brings
  // no sew-line layer (the raw-DXF case the fixtures cover).
  it('marks pieces from a profile-mapped DXF', () => {
    const doc = parseDXF(buildDXF([{ kind: 'rect', layer: '1' }]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    expect(pieces[0].outlineIsCutLine).toBe(true);
  });

  it('marks pieces from a profile-less DXF (unknown-layer fallback outline)', () => {
    const doc = parseDXF(buildDXF([{ kind: 'rect', layer: 'WHATEVER' }]));
    const pieces = dxfToPatternPieces(doc);

    expect(pieces.length).toBe(1);
    expect(pieces[0].outlineIsCutLine).toBe(true);
  });
});

// ─── 1c. Dense sew line promotes to outline (hallazgo #3) ───

/** Build a flat-entities DXF from explicit closed LWPOLYLINEs. */
function buildPolyDXF(specs: { layer: string; points: { x: number; y: number }[] }[]): string {
  const lines: string[] = [
    '  0', 'SECTION', '  2', 'HEADER', '  0', 'ENDSEC',
    '  0', 'SECTION', '  2', 'ENTITIES',
  ];
  for (const s of specs) {
    lines.push(
      '  0', 'LWPOLYLINE',
      '  8', s.layer,
      ' 90', String(s.points.length),
      ' 70', '1', // closed
    );
    for (const p of s.points) {
      lines.push(' 10', p.x.toFixed(4), ' 20', p.y.toFixed(4), ' 42', '0.0');
    }
  }
  lines.push('  0', 'ENDSEC', '  0', 'EOF');
  return lines.join('\n');
}

/** Sample a circle as a closed polygon with `n` vertices. */
function circlePoints(cx: number, cy: number, r: number, n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

describe('dense sew line promotes to outline (hallazgo #3)', () => {
  // CLO exports the cut boundary as a COARSE polyline (29-56 vertices in
  // María's file) while the sew line (layer 84) carries the SAME curve at
  // ~7x resolution (192-274 vertices). On a net pattern both trace one
  // curve — rendering both gives the ugly faceted double line María saw.
  // When the dense sew line geometrically coincides with the coarse cut
  // boundary, it IS the better sample of the outline: promote it and drop
  // the duplicate internal.
  it('coincident denser sew line replaces the coarse cut outline', () => {
    const doc = parseDXF(buildPolyDXF([
      { layer: '1', points: circlePoints(50, 50, 40, 8) },   // coarse cut
      { layer: '84', points: circlePoints(50, 50, 40, 64) }, // dense sew, same circle
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    // Outline is now the dense polyline (M + 63 L + Z), not the octagon.
    expect(pieces[0].outline.length).toBeGreaterThan(60);
    // The duplicate seam internal is gone — no double contour.
    expect(pieces[0].internals.filter(i => i.type === 'seam').length).toBe(0);
    // Still the cut boundary (net pattern): provenance flag preserved.
    expect(pieces[0].outlineIsCutLine).toBe(true);
  });

  it('an OFFSET sew line (baked seam allowance) is NOT promoted', () => {
    const doc = parseDXF(buildPolyDXF([
      { layer: '1', points: circlePoints(50, 50, 40, 8) },   // cut contour
      { layer: '84', points: circlePoints(50, 50, 30, 64) }, // sew inset 10 — real SA
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    // Outline stays the cut octagon (M + 8 L + Z = 10 commands).
    expect(pieces[0].outline.length).toBe(10);
    // The sew line stays as a seam internal — it carries real information.
    expect(pieces[0].internals.filter(i => i.type === 'seam').length).toBe(1);
  });

  it('a sew line covering only PART of the boundary is NOT promoted', () => {
    const denseArc = circlePoints(50, 50, 40, 64).slice(0, 24); // ~1/3 of the circle
    const doc = parseDXF(buildPolyDXF([
      { layer: '1', points: circlePoints(50, 50, 40, 8) },
      { layer: '84', points: denseArc },
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBe(10);
    expect(pieces[0].internals.filter(i => i.type === 'seam').length).toBe(1);
  });
});

// ─── 1d. POINT notch marks interpreted as edge-anchored notches (hallazgo #5) ───

/** Build a flat-entities DXF from closed LWPOLYLINEs + POINTs. */
function buildNotchDXF(
  polys: { layer: string; points: { x: number; y: number }[] }[],
  points: { layer: string; x: number; y: number }[],
): string {
  const lines: string[] = [
    '  0', 'SECTION', '  2', 'HEADER', '  0', 'ENDSEC',
    '  0', 'SECTION', '  2', 'ENTITIES',
  ];
  for (const s of polys) {
    lines.push('  0', 'LWPOLYLINE', '  8', s.layer, ' 90', String(s.points.length), ' 70', '1');
    for (const p of s.points) {
      lines.push(' 10', p.x.toFixed(4), ' 20', p.y.toFixed(4), ' 42', '0.0');
    }
  }
  for (const p of points) {
    lines.push('  0', 'POINT', '  8', p.layer, ' 10', p.x.toFixed(4), ' 20', p.y.toFixed(4));
  }
  lines.push('  0', 'ENDSEC', '  0', 'EOF');
  return lines.join('\n');
}

const SQUARE = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
];

describe('POINT notch marks interpreted as edge-anchored notches (hallazgo #5)', () => {
  // CLO/AAMA exports notches as POINT entities on layer 4 — position-only
  // markers ON the cut boundary. The converter used to synthesize a generic
  // 6-unit VERTICAL tick at that position (half outside the piece, blind to
  // the edge direction) — "pone las rayas pero no lo interpreta" (María).
  // A mark on the boundary is a real notch: project it onto the outline,
  // point it inward along the edge normal, give it the native notch model
  // (generateNotchPath + notchOptions) — same as the notch tool produces.
  it('a POINT on the boundary becomes a perpendicular inward notch', () => {
    // Mark on the LEFT edge midpoint (0,50). Flipped piece space: (0,-50);
    // left edge is vertical, inward normal = +x.
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: SQUARE }],
      [{ layer: '4', x: 0, y: 50 }],
    ));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    expect(notches.length).toBe(1);
    const [n] = notches;
    // Native notch model attached (editable like a tool-made notch).
    expect(n.notchOptions?.shape).toBe('slit');
    expect(n.notchOptions?.length).toBe(8);
    // Slit: M on the edge point, L 8mm inward (+x), not a vertical tick.
    expect(n.path.length).toBe(2);
    expect(n.path[0].values[0]).toBeCloseTo(0, 3);
    expect(n.path[0].values[1]).toBeCloseTo(-50, 3);
    expect(n.path[1].values[0]).toBeCloseTo(8, 3);
    expect(n.path[1].values[1]).toBeCloseTo(-50, 3);
  });

  it('a POINT on the bottom edge points inward too (orientation follows the edge)', () => {
    // Mark at (50,100): flipped (50,-100) on the y=-100 edge → inward = +y.
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: SQUARE }],
      [{ layer: '4', x: 50, y: 100 }],
    ));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    const [n] = pieces[0].internals.filter(i => i.type === 'notch');
    expect(n.path[0].values[0]).toBeCloseTo(50, 3);
    expect(n.path[0].values[1]).toBeCloseTo(-100, 3);
    expect(n.path[1].values[0]).toBeCloseTo(50, 3);
    expect(n.path[1].values[1]).toBeCloseTo(-92, 3); // 8mm toward the interior
  });

  it('a POINT far from the boundary (drill hole) keeps the legacy tick', () => {
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: SQUARE }],
      [{ layer: '4', x: 50, y: 50 }], // dead center — 50 units from every edge
    ));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    const [n] = pieces[0].internals.filter(i => i.type === 'notch');
    // Vertical 6-unit tick centered on the mark — we do NOT invent an edge anchor.
    expect(n.path.length).toBe(2);
    expect(n.path[0].values[0]).toBeCloseTo(50, 3);
    expect(n.path[1].values[0]).toBeCloseTo(50, 3);
    expect(Math.abs(n.path[1].values[1] - n.path[0].values[1])).toBeCloseTo(6, 3);
  });

  it('an interpreted notch is back-filled with a parametric anchor (notch-precision F2)', () => {
    // Mark at (0,30) → flipped (0,-30), on the left edge 30 units from the
    // corner (0,0). interpretNotchMark already computes the projection — the
    // anchor persists it so the precision modal can read the placement back.
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: SQUARE }],
      [{ layer: '4', x: 0, y: 30 }],
    ));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    const [n] = pieces[0].internals.filter(i => i.type === 'notch');
    expect(n.notchAnchor).toBeDefined();
    expect(n.notchAnchor!.refPoint.x).toBeCloseTo(0, 3);
    expect(n.notchAnchor!.refPoint.y).toBeCloseTo(0, 3);
    expect(n.notchAnchor!.distanceMm).toBeCloseTo(30, 3);
  });

  it('the back-filled anchor is stored in FINAL units (post-scale mm)', () => {
    // 10×10 cm square, mark 3cm from the corner → anchor must read 30mm,
    // because the generic scaling loop only scales paths, not data fields.
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
      [{ layer: '4', x: 0, y: 3 }],
    ));
    const pieces = dxfToPatternPieces(doc, { unit: 'cm', formatProfile: getProfile('aama') });

    const [n] = pieces[0].internals.filter(i => i.type === 'notch');
    expect(n.notchAnchor).toBeDefined();
    expect(n.notchAnchor!.refPoint.x).toBeCloseTo(0, 3);
    expect(n.notchAnchor!.refPoint.y).toBeCloseTo(0, 3);
    expect(n.notchAnchor!.distanceMm).toBeCloseTo(30, 3);
  });

  it('drill holes get no anchor — we never invent an edge reference', () => {
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: SQUARE }],
      [{ layer: '4', x: 50, y: 50 }],
    ));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    const [n] = pieces[0].internals.filter(i => i.type === 'notch');
    expect(n.notchAnchor).toBeUndefined();
  });

  it('notch size compensates the unit factor — 8mm real after cm scaling', () => {
    // 10×10 cm square; the converter scales ×10 to mm AFTER building the
    // piece, so the notch must be generated at 0.8 file-units to land at 8mm.
    const doc = parseDXF(buildNotchDXF(
      [{ layer: '1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
      [{ layer: '4', x: 0, y: 5 }],
    ));
    const pieces = dxfToPatternPieces(doc, { unit: 'cm', formatProfile: getProfile('aama') });

    const [n] = pieces[0].internals.filter(i => i.type === 'notch');
    expect(n.path[0].values[0]).toBeCloseTo(0, 3);
    expect(n.path[0].values[1]).toBeCloseTo(-50, 3);
    expect(n.path[1].values[0]).toBeCloseTo(8, 3); // 8mm inward, post-scale
    expect(n.notchOptions?.length).toBe(8);
  });
});

// ─── 2. POINT notches ───

describe('POINT entities as notch markers', () => {
  it('POINT on AAMA notch layer 4 becomes a notch internal with a tick path', () => {
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: '1' },
      { kind: 'point', layer: '4' },
      { kind: 'point', layer: '4' },
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    const notches = pieces[0].internals.filter(i => i.type === 'notch');
    expect(notches.length).toBe(2);
    // Tick path: 2 commands (M + L) centered on the point, Y-flipped.
    for (const n of notches) {
      expect(n.path.length).toBe(2);
      expect(n.path[0].type).toBe('M');
      expect(n.path[0].values[0]).toBe(50); // x preserved
    }
  });

  it('construction POINTs (layers 2/3) stay inert — no internals, no outline pollution', () => {
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: '1' },
      { kind: 'point', layer: '2' },
      { kind: 'point', layer: '2' },
      { kind: 'point', layer: '3' },
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    expect(pieces[0].internals.length).toBe(0);
    expect(pieces[0].outline.length).toBe(cutOnlyOutlineLength());
  });
});

// ─── 3. Unknown layers must not corrupt a cut-role outline ───

describe('unknown-layer outline protection', () => {
  it('an unmapped vendor layer does not glue onto an existing cut outline', () => {
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: '1' },
      { kind: 'rect', layer: '86' }, // unmapped vendor layer → role 'unknown'
    ]));
    const pieces = dxfToPatternPieces(doc, { formatProfile: getProfile('aama') });

    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBe(cutOnlyOutlineLength());
  });

  it('files with ONLY unknown layers still produce an outline (fallback preserved)', () => {
    // No cut-role entity anywhere → unknowns must still assemble the outline
    // (locks the behavior dxfImport.test.ts:190 also relies on).
    const doc = parseDXF(buildDXF([
      { kind: 'rect', layer: 'SOMETHING_ELSE' },
      { kind: 'openline', layer: 'OTHER_THING' },
    ]));
    const pieces = dxfToPatternPieces(doc); // no profile → all unknown

    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });
});
