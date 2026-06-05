// @vitest-environment jsdom
/**
 * Junta F1 regression — imported DXF pieces never receive the synthetic
 * 10mm seam-allowance margin.
 *
 * María dropped her DXF and the canvas drew a margin her file does not
 * carry (double contour + gray band + corner-offset spike). The fix is
 * provenance: the converter marks every imported piece `outlineIsCutLine`
 * and `effectiveSeamAllowanceWidth` returns 0 for it — the boundary layer
 * IS the cut line; the system must not invent geometry.
 *
 * The 4 frozen fixtures are raw DXFs WITHOUT a sew-line layer — exactly
 * the case that used to fall through to the 10mm default. (Files WITH a
 * sew layer were already suppressed via the `'seam'` internal since M3.5.)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDXFContent } from '../../src/utils/dxf';
import { effectiveSeamAllowanceWidth } from '../../src/utils/seam';
import { DEFAULT_SEAM_ALLOWANCE } from '../../src/utils/defaults';

const FIXTURES = [
  'jacket1_52-176.dxf',
  'male_shirt.dxf',
  'pajama_top_wrap2.dxf',
  'tshirt_test.dxf',
];

describe('DXF import — no synthetic seam allowance on imported pieces', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture}: every piece suppresses the editor default`, () => {
      const content = readFileSync(
        resolve(process.cwd(), 'tests/fixtures/garments', fixture),
        'utf8',
      );
      const { pieces } = importDXFContent(content, { unit: 'auto', autoDetect: true });
      expect(pieces.length).toBeGreaterThan(0);

      for (const piece of pieces) {
        expect(piece.outlineIsCutLine, `${piece.name} provenance flag`).toBe(true);
        expect(
          effectiveSeamAllowanceWidth(piece, DEFAULT_SEAM_ALLOWANCE),
          `${piece.name} synthetic SA width`,
        ).toBe(0);
      }
    });
  }
});
