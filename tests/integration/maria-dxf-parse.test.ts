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
import { detectDXFFormat } from '../../src/utils/dxf';

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

    // Stage 3: convert to pattern pieces (using detected format if known)
    const pieces = dxfToPatternPieces(doc);
    console.log('[dxfToPatternPieces] count:', pieces.length);
    if (pieces.length > 0) {
      console.log(
        '[dxfToPatternPieces] sample:',
        pieces.slice(0, 5).map((p) => ({
          name: p.name,
          vertexCount: p.outline?.length ?? p.vertices?.length ?? 0,
          hasInternalLines: (p.internalLines?.length ?? 0) > 0,
        })),
      );
    }

    expect(pieces.length).toBeGreaterThan(0);
  });
});
