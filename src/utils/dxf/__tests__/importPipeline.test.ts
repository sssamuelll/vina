import { describe, it, expect } from 'vitest';
import {
  importDXFContent,
  DXFParseError,
  readAndParseDXFFile,
  DXFFileError,
  DXF_MAX_BYTES,
} from '../importPipeline';

// A LWPOLYLINE rectangle — the parser turns this into exactly one piece.
// (Same fixture shape as importDxfExecutor.test.ts.)
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

// Parses cleanly but has no geometry → 0 pieces.
const HEADER_ONLY_DXF = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'EOF'].join('\n');

describe('importDXFContent', () => {
  it('imports a minimal DXF into pattern pieces', () => {
    const result = importDXFContent(MINIMAL_DXF);
    expect(result.pieces.length).toBe(1);
    expect(result.pieces[0].outline.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('format');
    expect(result).toHaveProperty('formatConfidence');
  });

  it('throws DXFParseError("empty") on blank content', () => {
    expect(() => importDXFContent('')).toThrow(DXFParseError);
    try {
      importDXFContent('   \n  ');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DXFParseError);
      expect((e as DXFParseError).code).toBe('empty');
    }
  });

  it('throws DXFParseError("no-pieces") when the DXF has no recognizable geometry', () => {
    try {
      importDXFContent(HEADER_ONLY_DXF);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DXFParseError);
      expect((e as DXFParseError).code).toBe('no-pieces');
    }
  });

  it('throws DXFParseError on non-DXF garbage (no pieces extracted)', () => {
    expect(() => importDXFContent('this is not a dxf file at all')).toThrow(DXFParseError);
  });

  it('is pure — returns data, never touches Redux', () => {
    // Two calls produce independent results (no shared mutable state leak).
    const a = importDXFContent(MINIMAL_DXF);
    const b = importDXFContent(MINIMAL_DXF);
    expect(a.pieces[0].id).not.toBe(b.pieces[0].id); // fresh ids each call
  });
});

describe('readAndParseDXFFile', () => {
  it('reads + parses a .dxf File into pieces', async () => {
    const file = new File([MINIMAL_DXF], 'pattern.dxf');
    const { name, result } = await readAndParseDXFFile(file);
    expect(name).toBe('pattern.dxf');
    expect(result.pieces.length).toBe(1);
  });

  it('throws DXFFileError("extension") for a non-.dxf file', async () => {
    const file = new File([MINIMAL_DXF], 'pattern.txt');
    await expect(readAndParseDXFFile(file)).rejects.toBeInstanceOf(DXFFileError);
    await readAndParseDXFFile(file).catch((e) => expect((e as DXFFileError).code).toBe('extension'));
  });

  it('throws DXFFileError("too-large") above the byte cap', async () => {
    const file = new File([MINIMAL_DXF], 'big.dxf');
    // Report an oversized length without allocating the bytes.
    Object.defineProperty(file, 'size', { value: DXF_MAX_BYTES + 1 });
    await readAndParseDXFFile(file).catch((e) => expect((e as DXFFileError).code).toBe('too-large'));
    await expect(readAndParseDXFFile(file)).rejects.toBeInstanceOf(DXFFileError);
  });

  it('propagates DXFParseError for a .dxf with no recognizable pieces', async () => {
    const file = new File([HEADER_ONLY_DXF], 'empty.dxf');
    await expect(readAndParseDXFFile(file)).rejects.toBeInstanceOf(DXFParseError);
  });
});
