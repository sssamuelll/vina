import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDXFContent } from '../../../utils/dxf';
import { extractNodes } from '../nodeEditorUtils';
import { classifyEditableAnchors } from '../anchorRoles';

const FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

describe('anchor roles — patrón real de María', () => {
  it('separates macro-corners from smooth samples without changing the outline', () => {
    const pieces = importDXFContent(readFileSync(FIXTURE, 'utf8'), {
      unit: 'auto', autoDetect: true,
    }).pieces;
    const piece = pieces.find((item) => item.outline.length > 100)!;
    const before = JSON.stringify(piece.outline);
    const result = classifyEditableAnchors(piece, extractNodes(piece));

    expect(piece.outline.some((cmd) => cmd.type === 'C' || cmd.type === 'Q')).toBe(false);
    expect(result.some((item) => item.role === 'corner')).toBe(true);
    expect(result.some((item) => item.role === 'smoothSample')).toBe(true);
    expect(result.some((item) => item.role === 'bezierAnchor')).toBe(false);
    expect(JSON.stringify(piece.outline)).toBe(before);
  });
});
