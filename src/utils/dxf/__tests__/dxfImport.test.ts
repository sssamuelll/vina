/**
 * DXF-AAMA import integration test.
 * Uses real industrial pattern file (model 5000) to verify full pipeline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseDXF } from '../parser';
import { dxfToPatternPieces } from '../converter';
import { getProfile } from '../formatProfiles';

// OJO: esta fixture vive FUERA del repo, en la carpeta de descargas de quien
// desarrolla. Donde no está, el bloque entero se salta en silencio — nunca ha
// corrido en CI. Por eso la aserción de la capa 8 se quedó vencida dos semanas
// tras a00851c0 sin que nada avisara. Mudar el archivo a tests/fixtures/ es la
// cura de fondo y está pendiente de decisión (procedencia del archivo de CAD).
const DXF_PATH = join(process.env.HOME ?? '', 'Downloads/CAD/DXF AAMA/5000.dxf');
const hasTestFile = existsSync(DXF_PATH);

describe.skipIf(!hasTestFile)('DXF-AAMA Import (model 5000)', () => {
  const dxf = hasTestFile ? readFileSync(DXF_PATH, 'utf-8') : '';
  const doc = hasTestFile ? parseDXF(dxf) : null;
  const pieces = doc ? dxfToPatternPieces(doc) : [];

  it('parses 4 blocks from DXF', () => {
    expect(doc!.blocks.size).toBe(4);
  });

  it('extracts 4 pattern pieces', () => {
    expect(pieces.length).toBe(4);
  });

  it('extracts correct piece names from AAMA "Piece Name:" text', () => {
    const names = pieces.map(p => p.name).sort();
    expect(names).toEqual(['Back', 'Front', 'Neck binding', 'Sleeve']);
  });

  it('each piece has a closed outline', () => {
    for (const p of pieces) {
      expect(p.outline.length).toBeGreaterThan(2);
      const hasMove = p.outline.some(c => c.type === 'M');
      const hasClose = p.outline.some(c => c.type === 'Z');
      expect(hasMove).toBe(true);
      expect(hasClose).toBe(true);
    }
  });

  it('extracts grainlines (layer 7)', () => {
    for (const p of pieces) {
      const grainlines = p.internals.filter(i => i.type === 'grainline');
      expect(grainlines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('extracts notches from layer 4', () => {
    const front = pieces.find(p => p.name === 'Front')!;
    const notches = front.internals.filter(i => i.type === 'notch');
    expect(notches.length).toBeGreaterThan(0);
  });

  // Desde a00851c0 (#1019/#1020) la capa 8 ('draw') importa como
  // type:'reference', no como 'dart': una línea de estilo o un contorno de
  // bolsillo no es una pinza, y etiquetarlas así hacía que el validador
  // avisara sobre bolsillos. Este test pinea las DOS mitades del contrato —
  // que las líneas siguen llegando, y que ya no se llaman pinzas.
  it('Front piece has draw/internal lines (layer 8) typed as reference, not dart', () => {
    const front = pieces.find(p => p.name === 'Front')!;
    const references = front.internals.filter(i => i.type === 'reference');
    expect(references.length).toBeGreaterThan(0);
    const darts = front.internals.filter(i => i.type === 'dart');
    expect(darts.length).toBe(0);
  });

  it('outline coordinates are reasonable (not all zeros)', () => {
    for (const p of pieces) {
      const allValues = p.outline.flatMap(c => c.values);
      const nonZero = allValues.filter(v => Math.abs(v) > 1);
      expect(nonZero.length).toBeGreaterThan(10);
    }
  });
});

// ─── Minimal synthetic DXF helpers ───

/**
 * Build a minimal DXF string with a single LWPOLYLINE (closed rectangle)
 * on the given layer, plus no blocks (so it lands in the flat entity path).
 */
function buildMinimalDXF(layer: string): string {
  return [
    '  0', 'SECTION',
    '  2', 'HEADER',
    '  0', 'ENDSEC',
    '  0', 'SECTION',
    '  2', 'ENTITIES',
    '  0', 'LWPOLYLINE',
    '  8', layer,
    ' 90', '4',       // vertex count
    ' 70', '1',       // closed flag
    ' 10', '0.0',
    ' 20', '0.0',
    ' 42', '0.0',
    ' 10', '100.0',
    ' 20', '0.0',
    ' 42', '0.0',
    ' 10', '100.0',
    ' 20', '100.0',
    ' 42', '0.0',
    ' 10', '0.0',
    ' 20', '100.0',
    ' 42', '0.0',
    '  0', 'ENDSEC',
    '  0', 'EOF',
  ].join('\n');
}

/**
 * Build a minimal DXF string with two LWPOLYLINE entities:
 * - one on outlineLayer (closed rectangle, the piece boundary)
 * - one on internalLayer (a line segment, e.g. grainline)
 */
function buildMinimalDXFWithTwo(outlineLayer: string, internalLayer: string): string {
  return [
    '  0', 'SECTION',
    '  2', 'HEADER',
    '  0', 'ENDSEC',
    '  0', 'SECTION',
    '  2', 'ENTITIES',
    // Closed rectangle on outlineLayer
    '  0', 'LWPOLYLINE',
    '  8', outlineLayer,
    ' 90', '4',
    ' 70', '1',
    ' 10', '0.0',
    ' 20', '0.0',
    ' 42', '0.0',
    ' 10', '100.0',
    ' 20', '0.0',
    ' 42', '0.0',
    ' 10', '100.0',
    ' 20', '100.0',
    ' 42', '0.0',
    ' 10', '0.0',
    ' 20', '100.0',
    ' 42', '0.0',
    // Open line on internalLayer (grainline / other internal)
    '  0', 'LWPOLYLINE',
    '  8', internalLayer,
    ' 90', '2',
    ' 70', '0',
    ' 10', '20.0',
    ' 20', '50.0',
    ' 42', '0.0',
    ' 10', '80.0',
    ' 20', '50.0',
    ' 42', '0.0',
    '  0', 'ENDSEC',
    '  0', 'EOF',
  ].join('\n');
}

// ─── Profile-aware conversion tests ───

describe('Profile-aware conversion — Lectra IBA', () => {
  it('CONTOUR layer produces a piece outline with lectra profile', () => {
    const dxfStr = buildMinimalDXF('CONTOUR');
    const doc = parseDXF(dxfStr);
    const lectraProfile = getProfile('lectra');
    const pieces = dxfToPatternPieces(doc, { formatProfile: lectraProfile });

    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
    const hasMove = pieces[0].outline.some(c => c.type === 'M');
    expect(hasMove).toBe(true);
  });

  it('CONTOUR layer without profile falls back to unknown (still produces outline)', () => {
    // Without a profile, "CONTOUR" maps to 'unknown' which also accumulates as outline
    const dxfStr = buildMinimalDXF('CONTOUR');
    const doc = parseDXF(dxfStr);
    const pieces = dxfToPatternPieces(doc);

    // unknown role still adds to outline in the converter
    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });

  it('DROIT_FIL layer produces grainline internal with lectra profile', () => {
    // Need a CONTOUR outline entity so entitiesToPiece returns a piece,
    // plus a DROIT_FIL entity that should map to grainline.
    const dxfStr = buildMinimalDXFWithTwo('CONTOUR', 'DROIT_FIL');
    const doc = parseDXF(dxfStr);
    const lectraProfile = getProfile('lectra');
    const pieces = dxfToPatternPieces(doc, { formatProfile: lectraProfile });

    // DROIT_FIL should map to 'grainline' via lectra layerMap
    expect(pieces.length).toBe(1);
    const grainlines = pieces[0].internals.filter(i => i.type === 'grainline');
    expect(grainlines.length).toBeGreaterThan(0);
  });

  it('DROIT_FIL without profile is unknown (no grainline internal)', () => {
    // Without profile, DROIT_FIL is 'unknown' → goes into outline, not grainline internal.
    // CONTOUR is also 'unknown' without a profile, so both end up as outline.
    const dxfStr = buildMinimalDXFWithTwo('CONTOUR', 'DROIT_FIL');
    const doc = parseDXF(dxfStr);
    const pieces = dxfToPatternPieces(doc);

    expect(pieces.length).toBe(1);
    const grainlines = pieces[0].internals.filter(i => i.type === 'grainline');
    expect(grainlines.length).toBe(0);
  });

  it('lectra profile pattern match (lowercase contour) resolves to cut', () => {
    // layerMap stores 'CONTOUR' (uppercase), but layerPatterns use /contour/i
    // A layer named 'contour_ext' should match via pattern
    const dxfStr = buildMinimalDXF('contour_ext');
    const doc = parseDXF(dxfStr);
    const lectraProfile = getProfile('lectra');
    const pieces = dxfToPatternPieces(doc, { formatProfile: lectraProfile });

    // The pattern /contour/i should match 'contour_ext' → 'cut' → outline
    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });

  it('getProfile returns correct lectra profile object', () => {
    const profile = getProfile('lectra');
    expect(profile.id).toBe('lectra');
    expect(profile.layerMap['CONTOUR']).toBe('cut');
    expect(profile.layerMap['DROIT_FIL']).toBe('grainline');
    expect(profile.layerMap['CRAN']).toBe('notch');
  });

  it('existing AAMA behavior unchanged when no profile provided', () => {
    // Layer '1' (AAMA cut) should still map to cut without a profile
    const dxfStr = buildMinimalDXF('1');
    const doc = parseDXF(dxfStr);
    const pieces = dxfToPatternPieces(doc);

    expect(pieces.length).toBe(1);
    expect(pieces[0].outline.length).toBeGreaterThan(0);
  });

  it('convertHook is called when present in profile', () => {
    const dxfStr = buildMinimalDXF('CONTOUR');
    const doc = parseDXF(dxfStr);
    let hookCalled = false;
    const profileWithHook = {
      ...getProfile('lectra'),
      convertHook: (piece: import('../../../types/types').PatternPiece) => {
        hookCalled = true;
        return { ...piece, name: 'hook-modified' };
      },
    };

    const pieces = dxfToPatternPieces(doc, { formatProfile: profileWithHook });
    expect(hookCalled).toBe(true);
    expect(pieces[0].name).toBe('hook-modified');
  });
});
