/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { detectDXFFormat } from '../formatDetector';
import type { DXFDocument } from '../types';

function makeDoc(layers: string[], entityLayers: string[] = [], header?: Map<string, string | number>): DXFDocument {
  return {
    header: header ?? new Map(),
    layers: layers.map(name => ({ name, color: 7, lineType: 'CONTINUOUS' })),
    entities: entityLayers.map(layer => ({ type: 'LINE', layer, data: { x1: 0, y1: 0, x2: 1, y2: 1 } as any })),
    blocks: new Map(),
  };
}

describe('detectDXFFormat', () => {
  it('detects AAMA from numeric layers', () => {
    const results = detectDXFFormat(makeDoc(['1', '4', '7', '8', '11']));
    expect(results[0].profileId).toBe('aama');
    expect(results[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it('detects ASTM from named layers', () => {
    const results = detectDXFFormat(makeDoc(['Piece Boundary', 'Sew Line', 'Grain Line', 'Notch']));
    expect(results[0].profileId).toBe('astm');
    expect(results[0].confidence).toBeGreaterThanOrEqual(70);
  });

  it('detects Gerber from AccuMark layers', () => {
    const results = detectDXFFormat(makeDoc(['Perimeter', 'Turn Points', 'Grain', 'Annotation']));
    expect(results[0].profileId).toBe('gerber');
    expect(results[0].confidence).toBeGreaterThanOrEqual(70);
  });

  // El umbral bajó de 80 a 70 (el mismo que ASTM y Gerber, que también se
  // prueban con 4 capas) porque el vocabulario de Lectra creció de 6 roles a
  // 7 al separar 'PINCE' → 'dart' de 'INT' → 'intcut' (#1020). El score es
  // recall sobre los roles del perfil, así que una muestra de 4 capas ahora
  // cubre 4/7 en vez de 4/6. Consecuencia real y asumida: un Lectra sin capa
  // de pinzas puntúa ~72 en vez de ~82. Sigue ganando por amplio margen.
  it('detects Lectra from IBA layers', () => {
    const results = detectDXFFormat(makeDoc(['CONTOUR', 'COUTURE', 'DROIT_FIL', 'CRAN']));
    expect(results[0].profileId).toBe('lectra');
    expect(results[0].confidence).toBeGreaterThanOrEqual(70);
  });

  it('sube la confianza cuando el archivo Lectra sí trae capa de pinzas', () => {
    const results = detectDXFFormat(makeDoc(['CONTOUR', 'COUTURE', 'DROIT_FIL', 'CRAN', 'PINCE']));
    expect(results[0].profileId).toBe('lectra');
    expect(results[0].confidence).toBeGreaterThanOrEqual(80);
  });

  it('falls back to standard for generic DXF', () => {
    const results = detectDXFFormat(makeDoc(['0', 'Defpoints']));
    expect(results[0].profileId).toBe('standard');
  });

  it('falls back to standard for empty DXF', () => {
    const results = detectDXFFormat(makeDoc([]));
    expect(results).toHaveLength(1);
    expect(results[0].profileId).toBe('standard');
    expect(results[0].confidence).toBe(10);
  });

  it('collects layers from entities when TABLES section is absent', () => {
    const results = detectDXFFormat(makeDoc([], ['CONTOUR', 'COUTURE', 'DROIT_FIL', 'CRAN']));
    expect(results[0].profileId).toBe('lectra');
  });

  it('handles case-insensitive layer names', () => {
    const results = detectDXFFormat(makeDoc(['contour', 'Couture', 'droit_fil']));
    expect(results[0].profileId).toBe('lectra');
  });

  it('always returns at least one result', () => {
    const results = detectDXFFormat(makeDoc([]));
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns ranked results sorted by confidence', () => {
    const results = detectDXFFormat(makeDoc(['1', '4', 'NOTCH']));
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });

  it('handles detectHook that throws', () => {
    const results = detectDXFFormat(makeDoc(['Perimeter']));
    expect(results).toBeDefined();
  });

  it('clamps confidence to 0-100', () => {
    const results = detectDXFFormat(makeDoc(['1', '4', '7', '8', '11']));
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });
});
