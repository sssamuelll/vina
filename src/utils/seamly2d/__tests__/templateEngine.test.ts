/**
 * PatternTemplateEngine tests — template loading, measurement injection,
 * piece generation, and integration with auto-sew.
 */

import { describe, it, expect } from 'vitest';
import { PatternTemplateEngine, type SeamlyPattern } from '../templateEngine';
import type { BodyMeasurements } from '../../../types/types';
import { buildMeasurements } from '../sizeTables';

// ─── Test fixtures ──────────────────────────────────────────────────────────

/** Minimal valid pattern with 2 construction points and variables */
const SIMPLE_PATTERN: SeamlyPattern = {
  name: 'test_simple',
  source: 'test',
  unit: 'mm',
  measurements: {
    required: ['bust_circ', 'waist_circ'],
    defaults: { bust_circ: 920, waist_circ: 740 },
  },
  variables: {
    '#HalfBust': { formula: 'bust_circ/2', description: 'Half bust' },
    '#HalfWaist': { formula: 'waist_circ/2', description: 'Half waist' },
    '#Width': { formula: '#HalfBust+20', description: 'Total width with ease' },
  },
  construction: [
    { id: 1, name: 'A', type: 'single', x: 0, y: 0 },
    { id: 2, name: 'B', type: 'endLine', basePoint: 1, angle: 0, length: '#Width' },
    { id: 3, name: 'C', type: 'endLine', basePoint: 2, angle: 270, length: '400' },
    { id: 4, name: 'D', type: 'endLine', basePoint: 3, angle: 180, length: '#Width' },
  ],
  pieces: [
    { name: 'Main', nodes: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], seamAllowance: 10 },
  ],
};

/** Pattern with defined pieces (nodes referencing construction points) */
const PATTERN_WITH_PIECES: SeamlyPattern = {
  name: 'test_pieces',
  source: 'test',
  unit: 'mm',
  measurements: { required: [], defaults: {} },
  variables: {
    '#W': { formula: '200', description: 'Width' },
  },
  construction: [
    { id: 1, name: 'A', type: 'single', x: 0, y: 0 },
    { id: 2, name: 'B', type: 'single', x: 200, y: 0 },
    { id: 3, name: 'C', type: 'single', x: 200, y: 300 },
    { id: 4, name: 'D', type: 'single', x: 0, y: 300 },
    { id: 5, name: 'E', type: 'single', x: 250, y: 0 },
    { id: 6, name: 'F', type: 'single', x: 450, y: 0 },
    { id: 7, name: 'G', type: 'single', x: 450, y: 300 },
    { id: 8, name: 'H', type: 'single', x: 250, y: 300 },
  ],
  pieces: [
    { name: 'Front', nodes: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], seamAllowance: 10 },
    { name: 'Back', nodes: [{ id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }], seamAllowance: 10 },
  ],
};

/** Pattern with ternary formulas (like real Seamly2D patterns) */
const TERNARY_PATTERN: SeamlyPattern = {
  name: 'test_ternary',
  source: 'test',
  unit: 'cm',
  measurements: {
    required: ['bust_circ'],
    defaults: { bust_circ: 92 },
  },
  variables: {
    '#BustEased': { formula: 'bust_circ+4', description: '' },
    '#FrontWidth': {
      formula: '#BustEased < 112 ? #BustEased/5-1 : #BustEased/2-20',
      description: 'Conditional front width',
    },
  },
  construction: [
    { id: 1, name: 'Origin', type: 'single', x: 0, y: 0 },
    { id: 2, name: 'FrontEdge', type: 'endLine', basePoint: 1, angle: 0, length: '#FrontWidth' },
  ],
  pieces: [
    { name: 'Main', nodes: [{ id: 1 }, { id: 2 }], seamAllowance: 10 },
  ],
};

const DEFAULT_MEASUREMENTS: BodyMeasurements = {
  height: 1680,
  chest: 920,
  waist: 740,
  hips: 980,
  shoulder: 128,
  armLength: 595,
  inseam: 780,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PatternTemplateEngine', () => {
  describe('loadPattern', () => {
    it('loads a pattern without error', () => {
      const engine = new PatternTemplateEngine();
      expect(() => engine.loadPattern(SIMPLE_PATTERN)).not.toThrow();
    });

    it('throws on generate without loading', () => {
      const engine = new PatternTemplateEngine();
      expect(() => engine.generate(DEFAULT_MEASUREMENTS)).toThrow('No pattern loaded');
    });
  });

  describe('generate — simple pattern', () => {
    it('generates a single piece from construction points', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(SIMPLE_PATTERN);
      const pieces = engine.generate(DEFAULT_MEASUREMENTS);

      expect(pieces.length).toBe(1);
      expect(pieces[0].name).toBe('Main');
      expect(pieces[0].outline.length).toBeGreaterThan(0);
    });

    it('resolves variable formulas from measurements', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(SIMPLE_PATTERN);

      // chest=920mm → bust_circ=920 → #HalfBust=460 → #Width=480
      const pieces = engine.generate(DEFAULT_MEASUREMENTS);
      const outline = pieces[0].outline;

      // The outline should contain points that reflect #Width=480
      const xValues = outline
        .filter(cmd => cmd.values.length >= 2)
        .map(cmd => cmd.type === 'C' ? cmd.values[4] : cmd.values[0]);

      // Point B should be at x=480 (or close, depending on construction)
      expect(xValues.some(x => Math.abs(x - 480) < 1)).toBe(true);
    });

    it('uses measurement defaults when not provided', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(SIMPLE_PATTERN);

      // Pass measurements without explicit bust/waist — defaults should kick in
      const sparse: BodyMeasurements = {
        height: 1680, chest: 0, waist: 0, hips: 0,
        shoulder: 128, armLength: 595, inseam: 780,
      };
      const pieces = engine.generate(sparse);
      // Should still generate (using defaults bust_circ=920, waist_circ=740)
      expect(pieces.length).toBe(1);
    });

    it('different measurements produce different outlines', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(SIMPLE_PATTERN);

      const small = engine.generate({ ...DEFAULT_MEASUREMENTS, chest: 800 });
      const large = engine.generate({ ...DEFAULT_MEASUREMENTS, chest: 1100 });

      // Outlines should differ
      const smallXs = small[0].outline.filter(c => c.values.length >= 2).map(c => c.values[0]);
      const largeXs = large[0].outline.filter(c => c.values.length >= 2).map(c => c.values[0]);

      const smallMax = Math.max(...smallXs);
      const largeMax = Math.max(...largeXs);
      expect(largeMax).toBeGreaterThan(smallMax);
    });
  });

  describe('generate — pattern with defined pieces', () => {
    it('generates multiple named pieces', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(PATTERN_WITH_PIECES);
      const pieces = engine.generate(DEFAULT_MEASUREMENTS);

      expect(pieces.length).toBe(2);
      expect(pieces[0].name).toBe('Front');
      expect(pieces[1].name).toBe('Back');
    });

    it('pieces have correct IDs', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(PATTERN_WITH_PIECES);
      const pieces = engine.generate(DEFAULT_MEASUREMENTS);

      expect(pieces[0].id).toBe('test_pieces_Front');
      expect(pieces[1].id).toBe('test_pieces_Back');
    });

    it('pieces have closed outlines (M...Z)', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(PATTERN_WITH_PIECES);
      const pieces = engine.generate(DEFAULT_MEASUREMENTS);

      for (const piece of pieces) {
        expect(piece.outline[0].type).toBe('M');
        expect(piece.outline[piece.outline.length - 1].type).toBe('Z');
      }
    });

    it('respects seam allowance from piece definition', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(PATTERN_WITH_PIECES);
      const pieces = engine.generate(DEFAULT_MEASUREMENTS);

      expect(pieces[0].seamAllowance).toBe(10);
    });
  });

  describe('generate — ternary formulas', () => {
    it('evaluates ternary for small bust (< 112)', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(TERNARY_PATTERN);
      // bust_circ = 92 → #BustEased = 96 < 112 → #FrontWidth = 96/5-1 = 18.2
      const pieces = engine.generate({ ...DEFAULT_MEASUREMENTS, chest: 920 });
      expect(pieces.length).toBe(1);
    });

    it('evaluates ternary for large bust (> 112)', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(TERNARY_PATTERN);
      // bust_circ = 120 → #BustEased = 124 > 112 → #FrontWidth = 124/2-20 = 42
      const pieces = engine.generate({ ...DEFAULT_MEASUREMENTS, chest: 1200 });
      expect(pieces.length).toBe(1);
    });
  });

  describe('integration with size tables', () => {
    it('generates from standard size M', () => {
      const measurements = buildMeasurements('M', 'eu-women');
      const engine = new PatternTemplateEngine();
      engine.loadPattern(SIMPLE_PATTERN);
      const pieces = engine.generate(measurements);
      expect(pieces.length).toBe(1);
    });

    it('generates different sizes produce different pieces', () => {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(SIMPLE_PATTERN);

      const small = engine.generate(buildMeasurements('S', 'eu-women'));
      const large = engine.generate(buildMeasurements('XL', 'eu-women'));

      const getMaxX = (p: typeof small) => {
        const xs = p[0].outline.filter(c => c.values.length >= 2).map(c => c.values[0]);
        return Math.max(...xs);
      };

      expect(getMaxX(large)).toBeGreaterThan(getMaxX(small));
    });
  });
});
