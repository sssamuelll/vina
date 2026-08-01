/**
 * @vitest-environment jsdom
 *
 * B1 (plan drape profesional 2026-07-02): off-switch del settle-tether.
 * Semántica opt-in disable: el tether corre por default; SOLO el valor literal
 * 'true' en localStorage('vina-tether-disabled') suprime la captura.
 * Lo consume el gate Cusick (B2): el tether congelaría a 2.5s el drape del
 * disco que el gate mide a 5s.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isTetherDisabled, TETHER_DISABLED_FLAG_KEY } from '../tetherFlag';

describe('isTetherDisabled', () => {
  beforeEach(() => {
    localStorage.removeItem(TETHER_DISABLED_FLAG_KEY);
  });

  it('returns false when the flag is unset (tether ON by default)', () => {
    expect(isTetherDisabled()).toBe(false);
  });

  it("returns true only for the literal 'true'", () => {
    localStorage.setItem(TETHER_DISABLED_FLAG_KEY, 'true');
    expect(isTetherDisabled()).toBe(true);
  });

  it('returns false for any other value', () => {
    for (const v of ['false', '1', 'TRUE', 'yes', '']) {
      localStorage.setItem(TETHER_DISABLED_FLAG_KEY, v);
      expect(isTetherDisabled(), `value ${JSON.stringify(v)}`).toBe(false);
    }
  });
});
