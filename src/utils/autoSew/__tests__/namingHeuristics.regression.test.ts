/**
 * Regression guard for #518 — the naming heuristic was silently a no-op for two
 * large families of real pattern names:
 *
 *  1. camelCase / PascalCase compound names ("FrontPanel", "ShortSleeve"). The old
 *     normalize() lowercased without splitting, producing a single token
 *     "frontpanel" that no rule could match.
 *  2. Cyrillic (Russian / Ukrainian) names ("Спинка", "Полочка", "Рукав", "Комір")
 *     — present in jacket1-6 and pants1 — which had no entry in TRANSLATIONS.
 *
 * In both cases scorePieceNames returned null, so seams formed only by arc-length
 * coincidence. These tests lock in that the heuristic now fires for both families.
 */
import { describe, it, expect } from 'vitest';
import { scorePieceNames } from '../namingHeuristics';

describe('#518 — naming heuristic handles camelCase and Cyrillic names', () => {
  describe('camelCase / PascalCase compound names', () => {
    it('FrontPanel ↔ BackPanel → Front↔Back side seams', () => {
      const r = scorePieceNames('FrontPanel', 'BackPanel');
      expect(r).not.toBeNull();
      expect(r!.score).toBeGreaterThanOrEqual(0.85);
      expect(r!.edgeHints.some((h) => h.position === 'side')).toBe(true);
    });

    it('FrontPanel ↔ ShortSleeve → Body↔Sleeve armhole', () => {
      const r = scorePieceNames('FrontPanel', 'ShortSleeve');
      expect(r).not.toBeNull();
      expect(r!.edgeHints.some((h) => h.position === 'armhole')).toBe(true);
    });

    it('CollarBase ↔ BackPanel → Body↔Collar neckline', () => {
      const r = scorePieceNames('CollarBase', 'BackPanel');
      expect(r).not.toBeNull();
      expect(r!.edgeHints.some((h) => h.position === 'neckline')).toBe(true);
    });

    it('FullSleeve ↔ Cuff → Sleeve↔Cuff', () => {
      const r = scorePieceNames('FullSleeve', 'Cuff');
      expect(r).not.toBeNull();
      expect(r!.score).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('Cyrillic (Russian / Ukrainian) names', () => {
    it('Спинка (back) ↔ Полочка (front) → Front↔Back', () => {
      const r = scorePieceNames('Спинка', 'Полочка');
      expect(r).not.toBeNull();
      expect(r!.score).toBeGreaterThanOrEqual(0.85);
    });

    it('Полочка (front) ↔ Рукав (sleeve) → Body↔Sleeve armhole', () => {
      const r = scorePieceNames('Полочка', 'Рукав');
      expect(r).not.toBeNull();
      expect(r!.edgeHints.some((h) => h.position === 'armhole')).toBe(true);
    });

    it('Полочка (front) ↔ Комір (collar) → Body↔Collar neckline', () => {
      const r = scorePieceNames('Полочка', 'Комір');
      expect(r).not.toBeNull();
      expect(r!.edgeHints.some((h) => h.position === 'neckline')).toBe(true);
    });

    it('Полочка (front) ↔ Подборт (facing) → Body↔Facing', () => {
      const r = scorePieceNames('Полочка', 'Подборт');
      expect(r).not.toBeNull();
    });
  });

  it('still returns null for genuinely unrelated names', () => {
    // Guards against the camelCase/translation changes over-matching. "Detail"
    // (the generic tshirt/blouse name) carries no semantic, so it must NOT match.
    expect(scorePieceNames('Detail', 'Detail')).toBeNull();
  });
});
