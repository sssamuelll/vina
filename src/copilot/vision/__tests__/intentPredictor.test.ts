import { describe, it, expect } from 'vitest';
import {
  checkAreaIntegrity,
  checkSelfIntersection,
  checkSeamCompatibility,
  simulateChange,
  formatAuditResultsForLLM,
  predictIntent,
} from '../intentPredictor';
import type { PathCommand, PatternPiece } from '../../../types/types';

describe('Intent Predictor - Area Integrity', () => {
  const validSquare: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];

  const degenerateSquare: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 0] }, // Collinear points
    { type: 'L', values: [0, 0] },
    { type: 'Z', values: [] },
  ];

  it('should pass for valid polygon with positive area', () => {
    const result = checkAreaIntegrity({ outline: validSquare });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('area_integrity');
    expect(result.area).toBeGreaterThan(0);
  });

  it('should fail for degenerate polygon with zero area', () => {
    const result = checkAreaIntegrity({ outline: degenerateSquare });

    expect(result.passed).toBe(false);
    expect(result.rule).toBe('area_integrity');
    expect(result.message).toContain('zero');
  });

  it('should fail for polygon below minimum area threshold', () => {
    const tinySquare: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0.5, 0] },
      { type: 'L', values: [0.5, 0.5] },
      { type: 'L', values: [0, 0.5] },
      { type: 'Z', values: [] },
    ];

    const result = checkAreaIntegrity({ outline: tinySquare, minArea: 1 });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('below minimum');
  });

  it('should handle empty outline', () => {
    const result = checkAreaIntegrity({ outline: [] });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('empty');
  });
});

describe('Intent Predictor - Self Intersection', () => {
  const nonIntersecting: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];

  const selfIntersecting: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [0, 100] }, // Crosses the first line
    { type: 'Z', values: [] },
  ];

  it('should pass for non-intersecting polygon', () => {
    const result = checkSelfIntersection({ outline: nonIntersecting });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('self_intersection');
  });

  it('should fail for self-intersecting polygon', () => {
    const result = checkSelfIntersection({ outline: selfIntersecting });

    expect(result.passed).toBe(false);
    expect(result.rule).toBe('self_intersection');
    expect(result.message).toContain('self-intersect');
  });

  it('should pass for simple triangle', () => {
    const triangle: PathCommand[] = [
      { type: 'M', values: [50, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];

    const result = checkSelfIntersection({ outline: triangle });

    expect(result.passed).toBe(true);
  });
});

describe('Intent Predictor - Seam Compatibility', () => {
  it('should pass when edge lengths match within tolerance', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 100,
      tolerance: 2,
    });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('seam_compatibility');
  });

  it('should pass when edge lengths are within tolerance', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 101.5,
      tolerance: 2,
    });

    expect(result.passed).toBe(true);
  });

  it('should fail when edge lengths differ beyond tolerance', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 110,
      tolerance: 2,
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('mismatch');
    expect(result.lengthDifference).toBe(10);
  });

  it('should use default tolerance of 5mm', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 104,
    });

    expect(result.passed).toBe(true); // Within default 5mm tolerance
  });

  it('should suggest easing when slightly off', () => {
    const result = checkSeamCompatibility({
      pieceAEdgeLength: 100,
      pieceBEdgeLength: 107,
      tolerance: 5,
    });

    expect(result.passed).toBe(false);
    expect(result.suggestedFix).toContain('ease');
  });
});

describe('Intent Predictor - Sandbox Simulation', () => {
  const basePiece: PatternPiece = {
    id: 'piece-1',
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should pass all audits for valid change', () => {
    const result = simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [110, 0] },
        { type: 'L', values: [110, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });

    expect(result.isSafe).toBe(true);
    expect(result.auditResults.every(r => r.passed)).toBe(true);
  });

  it('should fail for degenerate change', () => {
    const result = simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 0] }, // Collapses to zero area
        { type: 'L', values: [0, 0] },
        { type: 'Z', values: [] },
      ],
    });

    expect(result.isSafe).toBe(false);
    expect(result.auditResults.some(r => r.rule === 'area_integrity' && !r.passed)).toBe(true);
  });

  it('should fail for self-intersecting change', () => {
    const result = simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });

    expect(result.isSafe).toBe(false);
    expect(result.auditResults.some(r => r.rule === 'self_intersection' && !r.passed)).toBe(true);
  });

  it('should not mutate original piece', () => {
    const originalOutline = JSON.stringify(basePiece.outline);

    simulateChange({
      piece: basePiece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [200, 0] },
        { type: 'L', values: [200, 200] },
        { type: 'L', values: [0, 200] },
        { type: 'Z', values: [] },
      ],
    });

    expect(JSON.stringify(basePiece.outline)).toBe(originalOutline);
  });
});

describe('Intent Predictor - LLM Feedback', () => {
  it('should format passing results concisely', () => {
    const results: import('../types').AuditResult[] = [
      { rule: 'area_integrity', passed: true },
      { rule: 'self_intersection', passed: true },
    ];

    const formatted = formatAuditResultsForLLM(results);

    expect(formatted).toContain('All checks passed');
  });

  it('should format failing results with details', () => {
    const results: import('../types').AuditResult[] = [
      { rule: 'area_integrity', passed: false, message: 'Polygon has zero area' },
      { rule: 'self_intersection', passed: true },
    ];

    const formatted = formatAuditResultsForLLM(results);

    expect(formatted).toContain('FAILED');
    expect(formatted).toContain('area_integrity');
    expect(formatted).toContain('zero area');
  });

  it('should include suggested fixes', () => {
    const results: import('../types').AuditResult[] = [
      { rule: 'seam_compatibility', passed: false, message: 'Length mismatch' },
    ];
    const fixes = ['Consider easing by 5mm'];

    const formatted = formatAuditResultsForLLM(results, fixes);

    expect(formatted).toContain('Suggested fixes');
    expect(formatted).toContain('easing');
  });
});

describe('Intent Predictor - Full Prediction', () => {
  const piece: PatternPiece = {
    id: 'test-piece',
    name: 'Test',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should return full IntentPrediction for valid change', () => {
    const prediction = predictIntent({
      toolName: 'resizePiece',
      piece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [120, 0] },
        { type: 'L', values: [120, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
    });

    expect(prediction.toolName).toBe('resizePiece');
    expect(prediction.originalPieceId).toBe('test-piece');
    expect(prediction.isSafe).toBe(true);
    expect(prediction.auditResults.length).toBeGreaterThan(0);
  });

  it('should include suggestedFix for unsafe change', () => {
    const prediction = predictIntent({
      toolName: 'collapsePiece',
      piece,
      proposedOutline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [0, 0] },
        { type: 'L', values: [0, 0] },
        { type: 'Z', values: [] },
      ],
    });

    expect(prediction.isSafe).toBe(false);
    expect(prediction.suggestedFix).toBeDefined();
  });
});
