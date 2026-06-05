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
