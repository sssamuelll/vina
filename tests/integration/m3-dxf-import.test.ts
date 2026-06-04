// @vitest-environment jsdom
/**
 * M3 — DXF import, core path. Simulates what the browser drop-zone does
 * when María drops her file: read the bytes, run the shared
 * `importDXFContent` pipeline, dispatch the pieces into the REAL Redux
 * store, and assert they land. This is the exact path María triggers —
 * no LLM, no agentic loop (the agent operates downstream on the loaded
 * pieces; that path is covered by the M2 harness).
 *
 * In the browser the bytes come from `FileReader.readAsText`; here
 * `readFileSync` is the legitimate stand-in (the test owns the file —
 * the agent never does, per the sandbox constraint in the M3 spec).
 *
 * Opt-in: requires `M3_INTEGRATION=1` AND the DXF file to exist (reuses
 * the `MARIA_DXF` env var from maria-dxf-parse.test.ts). Skipped on CI
 * and default `npm run test`.
 *
 *   M3_INTEGRATION=1 MARIA_DXF=/path/to/her.dxf npx vitest run tests/integration/m3-dxf-import.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { importDXFContent } from '../../src/utils/dxf';
import { store } from '../../src/store';
import { addPiece } from '../../src/store/projectSlice';
import { selectPiece } from '../../src/store/editorSlice';

const MARIA_DXF = process.env.MARIA_DXF ?? 'C:\\Users\\simon\\Desktop\\temp.dxf';
const shouldRun = process.env.M3_INTEGRATION === '1' && existsSync(MARIA_DXF);

describe.skipIf(!shouldRun)('M3 DXF import — core path (drop-zone simulation)', () => {
  it("imports María's real DXF into the Redux store via the shared pipeline", () => {
    const content = readFileSync(MARIA_DXF, 'utf8');
    expect(content.length).toBeGreaterThan(0);

    // Stage 1 — shared core (the exact call AppShell's drop handler makes).
    const { pieces, format, formatConfidence } = importDXFContent(content, {
      unit: 'auto',
      autoDetect: true,
    });
    console.log('[m3-import] pieces:', pieces.length, 'format:', format, 'confidence:', formatConfidence);
    expect(pieces.length).toBeGreaterThan(0);

    // Stage 2 — dispatch into the real store (the drop handler's effect).
    const baseline = store.getState().project.pieces.length;
    for (const piece of pieces) store.dispatch(addPiece(piece));
    store.dispatch(selectPiece(pieces[0].id));

    const after = store.getState().project.pieces.length;
    console.log('[m3-import] store pieces:', baseline, '→', after);
    expect(after - baseline).toBe(pieces.length);

    // María's pattern is the AAMA top probed in 6251ef9f (5 pieces).
    expect(pieces.length).toBeGreaterThanOrEqual(5);
  });
});
