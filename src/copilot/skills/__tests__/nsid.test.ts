/**
 * Tests for NSID (Namespace Identifier) module.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidNSID,
  parseNSID,
  createNSID,
  validateNSID,
} from '../nsid';

describe('nsid', () => {
  describe('isValidNSID', () => {
    it('returns true for valid NSID format', () => {
      expect(isValidNSID('openclo:bodice')).toBe(true);
      expect(isValidNSID('sdar:stretch_bodice')).toBe(true);
      expect(isValidNSID('user123:my-skill')).toBe(true);
      expect(isValidNSID('a:b')).toBe(true);
    });

    it('returns false for invalid formats', () => {
      expect(isValidNSID('nobodice')).toBe(false);
      expect(isValidNSID(':bodice')).toBe(false);
      expect(isValidNSID('openclo:')).toBe(false);
      expect(isValidNSID('')).toBe(false);
      expect(isValidNSID('a:b:c')).toBe(false);
      expect(isValidNSID('open clo:bodice')).toBe(false);
      expect(isValidNSID('openclo:bod ice')).toBe(false);
    });
  });

  describe('parseNSID', () => {
    it('parses valid NSID into components', () => {
      const parsed = parseNSID('openclo:bodice');
      expect(parsed.author).toBe('openclo');
      expect(parsed.slug).toBe('bodice');
      expect(parsed.full).toBe('openclo:bodice');
    });

    it('parses NSID with underscores and hyphens', () => {
      const parsed = parseNSID('my_author:my-skill_v2');
      expect(parsed.author).toBe('my_author');
      expect(parsed.slug).toBe('my-skill_v2');
    });

    it('throws for invalid NSID', () => {
      expect(() => parseNSID('invalid')).toThrow('Invalid NSID');
      expect(() => parseNSID('')).toThrow('Invalid NSID');
      expect(() => parseNSID(':slug')).toThrow('Invalid NSID');
    });
  });

  describe('createNSID', () => {
    it('creates NSID from author and slug', () => {
      const nsid = createNSID('openclo', 'bodice');
      expect(nsid).toBe('openclo:bodice');
    });

    it('creates NSID with special characters', () => {
      const nsid = createNSID('my_author', 'my-skill');
      expect(nsid).toBe('my_author:my-skill');
    });

    it('throws for empty author', () => {
      expect(() => createNSID('', 'bodice')).toThrow();
    });

    it('throws for empty slug', () => {
      expect(() => createNSID('openclo', '')).toThrow();
    });

    it('throws for invalid characters', () => {
      expect(() => createNSID('open clo', 'bodice')).toThrow();
      expect(() => createNSID('openclo', 'bod ice')).toThrow();
    });
  });

  describe('validateNSID', () => {
    it('returns valid result for correct NSID', () => {
      const result = validateNSID('openclo:bodice');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for missing colon', () => {
      const result = validateNSID('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('colon'))).toBe(true);
    });

    it('returns errors for empty author', () => {
      const result = validateNSID(':bodice');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('author'))).toBe(true);
    });

    it('returns errors for empty slug', () => {
      const result = validateNSID('openclo:');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('slug'))).toBe(true);
    });

    it('returns errors for empty string', () => {
      const result = validateNSID('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns errors for multiple colons', () => {
      const result = validateNSID('a:b:c');
      expect(result.valid).toBe(false);
    });
  });
});
