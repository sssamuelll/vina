import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  getLocalizedPieceName,
  getLabel,
} from '../languageDetection';

describe('detectLanguage', () => {
  it('should detect Spanish from patronaje terms', () => {
    expect(detectLanguage('Hazme un corpiño base talla 40')).toBe('es');
  });

  it('should detect Spanish from general Spanish words', () => {
    expect(detectLanguage('Quiero crear una falda con pinzas')).toBe('es');
  });

  it('should detect English from pattern-making terms', () => {
    expect(detectLanguage('Create a bodice block')).toBe('en');
  });

  it('should detect English from general English words', () => {
    expect(detectLanguage('Add a dart to the front piece')).toBe('en');
  });

  it('should detect Spanish from accented characters', () => {
    expect(detectLanguage('¿Cómo está el patrón?')).toBe('es');
  });

  it('should default to English on ambiguous input', () => {
    expect(detectLanguage('hello')).toBe('en');
  });

  it('should handle empty string', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('should detect Spanish with mixed case', () => {
    expect(detectLanguage('AGREGAR PINZA DE BUSTO')).toBe('es');
  });
});

describe('getLocalizedPieceName', () => {
  it('should return Spanish name for bodice-front', () => {
    expect(getLocalizedPieceName('bodice-front', 'es')).toBe('Delantero Corpiño');
  });

  it('should return English name for bodice-front', () => {
    expect(getLocalizedPieceName('bodice-front', 'en')).toBe('Front Bodice');
  });

  it('should return Spanish name for sleeve', () => {
    expect(getLocalizedPieceName('sleeve', 'es')).toBe('Manga');
  });

  it('should return English name for sleeve', () => {
    expect(getLocalizedPieceName('sleeve', 'en')).toBe('Sleeve');
  });

  it('should return template ID for unknown template', () => {
    expect(getLocalizedPieceName('unknown-template', 'en')).toBe('unknown-template');
  });
});

describe('getLabel', () => {
  it('should return Spanish label for seam-allowance', () => {
    expect(getLabel('seam-allowance', 'es')).toBe('Margen de costura');
  });

  it('should return English label for seam-allowance', () => {
    expect(getLabel('seam-allowance', 'en')).toBe('Seam allowance');
  });

  it('should return key for unknown label', () => {
    expect(getLabel('unknown-key', 'en')).toBe('unknown-key');
  });
});
