import { describe, it, expect } from 'vitest';
import { analyzeInspection } from '../agentAnalyzer';
import { TINY_PIECE_MESSAGE_PREFIX } from '../ruleEngine';
import type { InspectionData, Diagnostic } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<InspectionData> = {}): InspectionData {
  return {
    target: { type: 'piece', pieceId: 'p1' },
    timestamp: Date.now(),
    piece: {
      id: 'p1',
      name: 'Scrap',
      position: { x: 0, y: 0 },
      rotation: 0,
      seamAllowance: 0,
      area: 50,
    },
    seams: [],
    internals: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('analyzeInspection', () => {
  describe('tiny-piece suggestion', () => {
    it('generates a removePiece suggestion for an orphaned tiny piece diagnostic', async () => {
      const data = makeData();
      const diagnostics: Diagnostic[] = [
        {
          severity: 'warning',
          category: 'geometry',
          message: `${TINY_PIECE_MESSAGE_PREFIX} (50 mm²)`,
          detail: 'Small orphaned scraps can cause simulation jitter.',
        },
      ];

      const analysis = await analyzeInspection(data, diagnostics, () => {});

      const suggestion = analysis.suggestions.find(s => s.toolCall?.name === 'removePiece');
      expect(suggestion).toBeDefined();
      expect(suggestion!.toolCall!.params).toEqual({ pieceId: 'p1' });
    });

    it('does not generate removePiece suggestion for non-geometry diagnostics', async () => {
      const data = makeData();
      const diagnostics: Diagnostic[] = [
        {
          severity: 'warning',
          category: 'seam',
          message: 'No seam connections defined',
        },
      ];

      const analysis = await analyzeInspection(data, diagnostics, () => {});

      const suggestion = analysis.suggestions.find(s => s.toolCall?.name === 'removePiece');
      expect(suggestion).toBeUndefined();
    });
  });
});
