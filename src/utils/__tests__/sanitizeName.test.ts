import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  validateName,
  escapePdfString,
  escapeDxfString,
  MAX_NAME_LENGTH,
} from '../sanitizeName';

describe('sanitizeName', () => {
  it('passes through normal names unchanged', () => {
    expect(sanitizeName('Front Bodice')).toBe('Front Bodice');
  });

  it('trims whitespace', () => {
    expect(sanitizeName('  Front Bodice  ')).toBe('Front Bodice');
  });

  it('strips ASCII control characters', () => {
    expect(sanitizeName('Front\x00\x01\x1F Bodice')).toBe('Front Bodice');
  });

  it('strips C1 control characters', () => {
    expect(sanitizeName('Front\x80\x9F Bodice')).toBe('Front Bodice');
  });

  it('strips zero-width characters', () => {
    expect(sanitizeName('Front\u200B\uFEFF Bodice')).toBe('Front Bodice');
  });

  it('strips line/paragraph separators', () => {
    expect(sanitizeName('Front\u2028\u2029Bodice')).toBe('FrontBodice');
  });

  it('preserves accented and CJK characters', () => {
    expect(sanitizeName('Rücken Stück')).toBe('Rücken Stück');
    expect(sanitizeName('前身頃')).toBe('前身頃');
  });

  it('truncates to MAX_NAME_LENGTH', () => {
    const long = 'A'.repeat(200);
    expect(sanitizeName(long)).toBe('A'.repeat(MAX_NAME_LENGTH));
  });

  it('returns empty for control-chars-only input', () => {
    expect(sanitizeName('\x00\x01\x02')).toBe('');
  });
});

describe('validateName', () => {
  it('accepts valid names', () => {
    const result = validateName('Front Bodice');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Front Bodice');
    expect(result.errors).toEqual([]);
  });

  it('rejects empty names', () => {
    const result = validateName('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Name cannot be empty');
  });

  it('rejects whitespace-only names', () => {
    const result = validateName('   ');
    expect(result.valid).toBe(false);
  });

  it('rejects control-chars-only names', () => {
    const result = validateName('\x00\x01');
    expect(result.valid).toBe(false);
  });

  it('returns sanitized version alongside valid=true', () => {
    const result = validateName('  Front\x00 Bodice  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Front Bodice');
  });
});

describe('escapePdfString', () => {
  it('escapes backslashes', () => {
    expect(escapePdfString('a\\b')).toBe('a\\\\b');
  });

  it('escapes parentheses', () => {
    expect(escapePdfString('(Front)')).toBe('\\(Front\\)');
  });

  it('handles combined special chars', () => {
    expect(escapePdfString('(A\\B)')).toBe('\\(A\\\\B\\)');
  });

  it('passes through normal text', () => {
    expect(escapePdfString('Front Bodice')).toBe('Front Bodice');
  });
});

describe('escapeDxfString', () => {
  it('escapes backslashes', () => {
    expect(escapeDxfString('a\\b')).toBe('a\\\\b');
  });

  it('replaces newlines with spaces', () => {
    expect(escapeDxfString('Line1\nLine2')).toBe('Line1 Line2');
  });

  it('strips carriage returns', () => {
    expect(escapeDxfString('Line1\r\nLine2')).toBe('Line1 Line2');
  });

  it('passes through normal text', () => {
    expect(escapeDxfString('Front Bodice')).toBe('Front Bodice');
  });
});
