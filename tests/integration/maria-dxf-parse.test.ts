// @vitest-environment jsdom
/**
 * Probe — does openclo's existing DXF parser handle María's actual file
 * (`temp.dxf`, exported from her Adidas-internal workflow)? Read-only,
 * no Redux, no agentic loop. Just `parseDXF` + `dxfToPatternPieces` on
 * the raw file. Tells us whether the M3 "agentic DXF import" slice
 * needs only a tool wire (parser already handles real files) or
 * actually needs format-compat work (parser fails / drops pieces).
 *
 * Opt-in: file path is read from `MARIA_DXF` env var. Default location
 * `~/Desktop/temp.dxf` is reflected in the skip message — the file
 * lives outside the repo and is not committed.
 *
 *   MARIA_DXF=/path/to/her.dxf npx vitest run tests/integration/maria-dxf-parse.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseDXF, dxfToPatternPieces } from '../../src/utils/dxf';
import { detectDXFFormat, getProfile } from '../../src/utils/dxf';

const MARIA_DXF = process.env.MARIA_DXF ?? 'C:\\Users\\simon\\Desktop\\temp.dxf';
const shouldRun = existsSync(MARIA_DXF);

describe.skipIf(!shouldRun)('María DXF probe', () => {
  it('parses without throwing and produces at least one pattern piece', () => {
    const text = readFileSync(MARIA_DXF, 'utf8');
    expect(text.length).toBeGreaterThan(0);

    // Stage 1: raw DXF parse
    const doc = parseDXF(text);
    expect(doc).toBeDefined();
    expect(doc.entities.length).toBeGreaterThan(0);
    console.log('[parseDXF] entities:', doc.entities.length);
    console.log('[parseDXF] layers:', Array.from(new Set(doc.entities.map((e) => e.layer))).slice(0, 20));
    console.log('[parseDXF] entity types:', Array.from(new Set(doc.entities.map((e) => e.type))));

    // Stage 2: format detection
    const formats = detectDXFFormat(doc);
    console.log('[detectDXFFormat]:', formats);

    // Stage 3: convert to pattern pieces, applying the detected profile —
    // mirrors the production path (importDXFContent), which the previous
    // probe did not (it converted profile-less, so profile-mapped layers
    // like CLO's 84 never resolved).
    const profile = formats.length > 0 ? getProfile(formats[0].profileId) : undefined;
    const pieces = dxfToPatternPieces(doc, profile ? { formatProfile: profile } : undefined);
    console.log('[dxfToPatternPieces] count:', pieces.length);
    if (pieces.length > 0) {
      console.log(
        '[dxfToPatternPieces] sample:',
        pieces.slice(0, 5).map((p) => ({
          name: p.name,
          outlineCmds: p.outline.length,
          internals: p.internals.length,
          byType: p.internals.reduce<Record<string, number>>((acc, i) => {
            acc[i.type] = (acc[i.type] ?? 0) + 1;
            return acc;
          }, {}),
        })),
      );
    }

    expect(pieces.length).toBeGreaterThan(0);
  });

  it('M3.5 — extracts the internal-line fidelity a patternmaker expects', () => {
    const doc = parseDXF(readFileSync(MARIA_DXF, 'utf8'));
    const formats = detectDXFFormat(doc);
    const profile = formats.length > 0 ? getProfile(formats[0].profileId) : undefined;
    const pieces = dxfToPatternPieces(doc, profile ? { formatProfile: profile } : undefined);

    expect(pieces.length).toBe(5);
    for (const p of pieces) {
      const byType = (t: string) => p.internals.filter((i) => i.type === t).length;
      // CLO export skeleton per block: 1 grainline (LINE@7), 2 draw lines
      // (POLYLINE@8), 1 sew line (POLYLINE@84 → 'seam').
      expect(byType('grainline'), `${p.name} grainline`).toBe(1);
      expect(byType('dart'), `${p.name} darts`).toBe(2);
      // Hallazgo #3: María's pattern is NET — the dense sew line (192-274
      // vertices) coincides with the coarse cut boundary (29-56 vertices)
      // and is PROMOTED to be the outline; the duplicate internal is gone.
      // (Before: byType('seam') === 1 and outline < 60 cut-only commands —
      // which drew the faceted double contour she flagged.)
      expect(byType('seam'), `${p.name} seam promoted, no duplicate`).toBe(0);
    }
    // Outlines are now the dense sew samples (16/192/200/200/274 vertices,
    // M + n·L + Z) — not the coarse cut polylines (8-56 vertices) that drew
    // the faceted contour.
    expect(pieces.map((p) => p.outline.length).sort((a, b) => a - b))
      .toEqual([18, 194, 202, 202, 276]);
    // Notch/drill POINTs on layer 4: 2 + 0 + 0 + 2 + 4 across the 5 pieces.
    const totalNotches = pieces.reduce(
      (sum, p) => sum + p.internals.filter((i) => i.type === 'notch').length, 0);
    expect(totalNotches).toBe(8);
  });
});
