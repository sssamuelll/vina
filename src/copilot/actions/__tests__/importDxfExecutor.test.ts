import { describe, it, expect } from 'vitest';

// Minimal DXF content that parseDXF can parse
const MINIMAL_DXF = [
  '0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '8', '1', '70', '1', '90', '4',
  '10', '0', '20', '0',
  '10', '100', '20', '0',
  '10', '100', '20', '200',
  '10', '0', '20', '200',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n');

describe('import_dxf executor', () => {
  it('parses DXF content and produces pattern pieces', async () => {
    const { parseDXF } = await import('../../../utils/dxf/parser');
    const { dxfToPatternPieces } = await import('../../../utils/dxf/converter');

    const doc = parseDXF(MINIMAL_DXF);
    const pieces = dxfToPatternPieces(doc);
    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });
});
