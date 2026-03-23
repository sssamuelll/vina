import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NetworkValidator } from '../networkValidator';

describe('NetworkValidator', () => {
  // ─── Allowlist matching ────────────────────────────────────────────────────

  describe('isUrlAllowed — allowlist matching', () => {
    it('allows an exact URL that matches an allowlist pattern', () => {
      const validator = new NetworkValidator(['https://api.example.com/*']);
      expect(validator.isUrlAllowed('https://api.example.com/v1/data')).toBe(true);
    });

    it('allows a URL matching a subpath pattern', () => {
      const validator = new NetworkValidator(['https://cdn.example.com/*']);
      expect(
        validator.isUrlAllowed('https://cdn.example.com/assets/image.png'),
      ).toBe(true);
    });

    it('blocks a URL that does not match any allowlist pattern', () => {
      const validator = new NetworkValidator(['https://api.example.com/*']);
      expect(validator.isUrlAllowed('https://evil.com/steal')).toBe(false);
    });

    it('blocks everything when the allowlist is empty', () => {
      const validator = new NetworkValidator([]);
      expect(validator.isUrlAllowed('https://api.example.com/v1/data')).toBe(
        false,
      );
    });

    it('returns false for an invalid URL', () => {
      const validator = new NetworkValidator(['https://api.example.com/*']);
      expect(validator.isUrlAllowed('not-a-valid-url')).toBe(false);
    });
  });

  // ─── Private IP blocking ──────────────────────────────────────────────────

  describe('isUrlAllowed — private IP blocking', () => {
    // Use a permissive wildcard allowlist so only the IP check is the blocker
    let validator: NetworkValidator;
    beforeEach(() => {
      validator = new NetworkValidator(['http://*/*', 'https://*/*']);
    });

    it('blocks 10.x.x.x (Class-A private)', () => {
      expect(validator.isUrlAllowed('http://10.0.0.1/secret')).toBe(false);
    });

    it('blocks 192.168.x.x (Class-C private)', () => {
      expect(validator.isUrlAllowed('http://192.168.1.100/admin')).toBe(false);
    });

    it('blocks 172.16.x.x (Class-B private, lower bound)', () => {
      expect(validator.isUrlAllowed('http://172.16.0.1/')).toBe(false);
    });

    it('blocks 172.31.x.x (Class-B private, upper bound)', () => {
      expect(validator.isUrlAllowed('http://172.31.255.254/')).toBe(false);
    });

    it('blocks 169.254.x.x (link-local / cloud metadata)', () => {
      expect(
        validator.isUrlAllowed('http://169.254.169.254/latest/meta-data/'),
      ).toBe(false);
    });

    it('blocks 127.x.x.x (loopback)', () => {
      expect(validator.isUrlAllowed('http://127.0.0.1/api')).toBe(false);
    });

    it('blocks 0.x.x.x (reserved "this" network)', () => {
      expect(validator.isUrlAllowed('http://0.0.0.0/anything')).toBe(false);
    });

    it('blocks localhost hostname', () => {
      expect(validator.isUrlAllowed('http://localhost:3000/api')).toBe(false);
    });

    it('blocks IPv6 loopback ::1', () => {
      expect(validator.isUrlAllowed('http://[::1]/api')).toBe(false);
    });
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────

  describe('checkRateLimit', () => {
    let validator: NetworkValidator;

    beforeEach(() => {
      validator = new NetworkValidator(['https://api.example.com/*']);
      // Use fake timers so we control Date.now()
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('allows exactly 60 requests in a minute', () => {
      for (let i = 0; i < 60; i++) {
        expect(validator.checkRateLimit()).toBe(true);
      }
    });

    it('blocks the 61st request in the same minute', () => {
      for (let i = 0; i < 60; i++) {
        validator.checkRateLimit();
      }
      expect(validator.checkRateLimit()).toBe(false);
    });

    it('allows a new request after the window slides past old timestamps', () => {
      // Fill the window
      for (let i = 0; i < 60; i++) {
        validator.checkRateLimit();
      }
      expect(validator.checkRateLimit()).toBe(false);

      // Advance time by 61 seconds — all previous timestamps fall outside the window
      vi.advanceTimersByTime(61_000);

      expect(validator.checkRateLimit()).toBe(true);
    });
  });
});
