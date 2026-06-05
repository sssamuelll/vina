import { describe, it, expect } from 'vitest';
import { evaluateRules, TINY_PIECE_THRESHOLD_MM2, TINY_PIECE_MESSAGE_PREFIX } from '../ruleEngine';
import type { InspectionData } from '../types';
import type { PhysicalFabric } from '../../utils/cloth/physicalFabric';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFabric(overrides: Partial<PhysicalFabric> = {}): PhysicalFabric {
  return {
    id: 'cotton-plain',
    name: 'Cotton Plain',
    nameEs: 'Algodón Liso',
    composition: '100% Cotton',
    weaveType: 'plain',
    weight: 150,
    thickness: 0.3,
    stretchWarp: 3,
    stretchWeft: 4,
    stretchBias: 12,
    recoveryRate: 0.7,
    bendingWarp: 0.05,
    bendingWeft: 0.04,
    drapeCoefficient: 0.6,
    shearStiffness: 0.03,
    shearHysteresis: 0.01,
    friction: 0.25,
    frictionBody: 0.3,
    surfaceRoughness: 0.4,
    internalDamping: 0.3,
    tensileStrengthWarp: 300,
    tensileStrengthWeft: 250,
    tearStrength: 50,
    maxStretchBeforeBreak: 15,
    source: 'library',
    tags: [],
    ...overrides,
  };
}

function makeData(overrides: Partial<InspectionData> = {}): InspectionData {
  return {
    target: { type: 'piece', pieceId: 'p1' },
    timestamp: Date.now(),
    piece: {
      id: 'p1',
      name: 'Front Bodice',
      position: { x: 0, y: 0 },
      rotation: 0,
      seamAllowance: 10,
      area: 2500, // Default area for test piece
    },
    fabric: makeFabric(),
    edge: { name: 'top', type: 'straight', length: 100 },
    seams: [
      {
        id: 's1',
        partnerPieceId: 'p2',
        partnerPieceName: 'Back Bodice',
        edgeName: 'side',
        type: 'plain',
      },
    ],
    internals: [
      { type: 'grainline', count: 1 },
      { type: 'notch', count: 2 },
    ],
    simulation: {
      position: [0, 0, 0],
      collisionDistance: 5,
      particleCount: 100,
    },
    poms: [
      {
        id: 'pom1',
        name: 'Chest Width',
        category: 'width',
        method: 'straight',
        pointA: { pieceId: 'p1', localPosition: { x: 0, y: 0 } },
        pointB: { pieceId: 'p2', localPosition: { x: 100, y: 0 } },
        value: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('evaluateRules', () => {
  // ── Fabric rules ──────────────────────────────────────────────────────────

  it('fires fabric:no-fabric error when fabric is undefined', () => {
    const data = makeData({ fabric: undefined });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fabric' && d.severity === 'error')).toBe(true);
  });

  it('does not fire fabric error when fabric is assigned', () => {
    const data = makeData({ fabric: makeFabric() });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fabric' && d.severity === 'error')).toBe(false);
  });

  it('fires fabric:heavy-weight warning when weight > 400gsm', () => {
    const data = makeData({ fabric: makeFabric({ weight: 401 }) });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fabric' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire fabric weight warning at exactly 400gsm', () => {
    const data = makeData({ fabric: makeFabric({ weight: 400 }) });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fabric' && d.severity === 'warning')).toBe(false);
  });

  // ── Seam allowance rules ──────────────────────────────────────────────────

  it('SA = 0 is the normal NET state — no diagnostic (hallazgo #2)', () => {
    // Patternmakers work net; allowance is an explicit finishing step. SA 0
    // must not be flagged — the sim never consumes SA (display/export only).
    const data = makeData({ piece: { ...makeData().piece, seamAllowance: 0 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'seam-allowance')).toBe(false);
  });

  it('fires seam-allowance:too-small warning when SA < 3mm', () => {
    const data = makeData({ piece: { ...makeData().piece, seamAllowance: 2 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'seam-allowance' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire SA warning at exactly 3mm', () => {
    const data = makeData({ piece: { ...makeData().piece, seamAllowance: 3 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'seam-allowance' && d.severity === 'warning')).toBe(false);
    expect(diags.some(d => d.category === 'seam-allowance' && d.severity === 'error')).toBe(false);
  });

  it('does not fire SA zero error when SA > 0', () => {
    const data = makeData({ piece: { ...makeData().piece, seamAllowance: 10 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'seam-allowance' && d.severity === 'error')).toBe(false);
  });

  // ── Seam rules ────────────────────────────────────────────────────────────

  it('fires seam:no-connections warning when seams array is empty', () => {
    const data = makeData({ seams: [] });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'seam' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire seam warning when seams are present', () => {
    const data = makeData();
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'seam')).toBe(false);
  });

  // ── Internals rules ───────────────────────────────────────────────────────

  it('fires internals:no-grainline warning when no grainline internal', () => {
    const data = makeData({ internals: [{ type: 'notch', count: 2 }] });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'internals' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire grainline warning when grainline is present', () => {
    const data = makeData();
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'internals' && d.severity === 'warning')).toBe(false);
  });

  it('fires internals:no-notches info when no notch internal', () => {
    const data = makeData({ internals: [{ type: 'grainline', count: 1 }] });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'internals' && d.severity === 'info')).toBe(true);
  });

  it('does not fire notches info when notch is present', () => {
    const data = makeData();
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'internals' && d.severity === 'info')).toBe(false);
  });

  // ── Fit rules ─────────────────────────────────────────────────────────────

  it('fires fit:body-penetration critical when collisionDistance < 0', () => {
    const data = makeData({ simulation: { collisionDistance: -1, particleCount: 100 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fit' && d.severity === 'critical')).toBe(true);
  });

  it('fires fit:pressure-point warning when collisionDistance < 2mm', () => {
    const data = makeData({ simulation: { collisionDistance: 1, particleCount: 100 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fit' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire fit warning at exactly 2mm', () => {
    const data = makeData({ simulation: { collisionDistance: 2, particleCount: 100 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fit')).toBe(false);
  });

  it('does not fire fit rules when simulation is undefined', () => {
    const data = makeData({ simulation: undefined });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fit')).toBe(false);
  });

  it('does not fire fit rules when collisionDistance is undefined', () => {
    const data = makeData({ simulation: { particleCount: 100 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'fit')).toBe(false);
  });

  // ── Simulation rules ──────────────────────────────────────────────────────

  it('fires simulation:not-simulated warning when particleCount = 0', () => {
    const data = makeData({ simulation: { particleCount: 0, collisionDistance: 5 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'simulation' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire simulation warning when particleCount > 0', () => {
    const data = makeData();
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'simulation')).toBe(false);
  });

  it('does not fire simulation warning when simulation is undefined', () => {
    const data = makeData({ simulation: undefined });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'simulation')).toBe(false);
  });

  it('does not fire simulation warning when particleCount is undefined', () => {
    const data = makeData({ simulation: { collisionDistance: 5 } });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'simulation')).toBe(false);
  });

  // ── Construction rules ────────────────────────────────────────────────────

  it('fires construction:no-edges warning when edge is undefined and target type is not piece', () => {
    const data = makeData({
      target: { type: 'edge', pieceId: 'p1' },
      edge: undefined,
    });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'construction' && d.severity === 'warning')).toBe(true);
  });

  it('does not fire construction warning when edge is defined', () => {
    const data = makeData({
      target: { type: 'edge', pieceId: 'p1' },
      edge: { name: 'top', type: 'straight', length: 100 },
    });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'construction')).toBe(false);
  });

  it('does not fire construction warning when target type is piece even if edge is undefined', () => {
    const data = makeData({
      target: { type: 'piece', pieceId: 'p1' },
      edge: undefined,
    });
    const diags = evaluateRules(data);
    expect(diags.some(d => d.category === 'construction')).toBe(false);
  });

  // ── Sorting ───────────────────────────────────────────────────────────────

  it('returns diagnostics sorted by severity: error first, then critical, warning, info', () => {
    // Trigger error (no fabric), critical (collision < 0), warning (SA < 3), info (no notch)
    const data = makeData({
      fabric: undefined,
      piece: { ...makeData().piece, seamAllowance: 2 },
      simulation: { collisionDistance: -1, particleCount: 100 },
      internals: [{ type: 'grainline', count: 1 }], // no notch → info
    });
    const diags = evaluateRules(data);

    const severities = diags.map(d => d.severity);
    const order: Record<string, number> = { error: 0, critical: 1, warning: 2, info: 3 };
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]]);
    }
  });

  // ── Healthy piece ─────────────────────────────────────────────────────────

  it('returns no diagnostics for a fully healthy piece', () => {
    const data = makeData();
    const diags = evaluateRules(data);
    expect(diags).toHaveLength(0);
  });

  // ── Unresolved construction points ──────────────────────────────────

  describe('ruleUnresolvedPoints', () => {
    it('fires error when unresolvedPoints is non-empty', () => {
      const data = makeData({
        unresolvedPoints: [
          { label: 'bustApex', error: "Dangling reference: point 'shoulderPt' not found" },
        ],
      });
      const diagnostics = evaluateRules(data);
      const found = diagnostics.find(d => d.category === 'construction' && d.severity === 'error');
      expect(found).toBeDefined();
      expect(found!.message).toMatch(/1 construction point/);
    });

    it('does not fire when unresolvedPoints is absent', () => {
      const data = makeData();
      const diagnostics = evaluateRules(data);
      const found = diagnostics.find(d => d.category === 'construction' && d.message.match(/construction point.*failed/i));
      expect(found).toBeUndefined();
    });

    it('does not fire when unresolvedPoints is empty', () => {
      const data = makeData({ unresolvedPoints: [] });
      const diagnostics = evaluateRules(data);
      const found = diagnostics.find(d => d.category === 'construction' && d.message.match(/construction point.*failed/i));
      expect(found).toBeUndefined();
    });
  });

  // ── Multiple rules fire simultaneously ────────────────────────────────────

  it('can fire multiple rules at the same time', () => {
    const data = makeData({
      fabric: undefined,
      seams: [],
      internals: [],
    });
    const diags = evaluateRules(data);
    // fabric error, seam warning, internals:no-grainline warning, internals:no-notches info
    expect(diags.length).toBeGreaterThanOrEqual(4);
  });

  // ── Geometry rules ────────────────────────────────────────────────────────

  describe('ruleTinyPiece', () => {
    it('does not fire warning for a large piece (2500 mm2)', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 2500 },
        seams: [],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'geometry' && d.message.includes('tiny piece'))).toBe(false);
    });

    it('fires warning for an orphaned tiny piece (100 mm2)', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'geometry' && d.severity === 'warning')).toBe(true);
    });

    it('does not fire warning for a tiny piece (100 mm2) with an active seam', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [
          {
            id: 's1',
            partnerPieceId: 'p2',
            partnerPieceName: 'Back',
            edgeName: 'side',
            type: 'plain',
            active: true,
          },
        ],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'geometry')).toBe(false);
    });

    it('fires warning for a tiny piece (100 mm2) with only inactive seams', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [
          {
            id: 's1',
            partnerPieceId: 'p2',
            partnerPieceName: 'Back',
            edgeName: 'side',
            type: 'plain',
            active: false,
          },
        ],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'geometry' && d.severity === 'warning')).toBe(true);
    });

    // ── Boundary tests ────────────────────────────────────────────────────

    it('does not fire warning at exactly the threshold (1000 mm2)', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: TINY_PIECE_THRESHOLD_MM2 },
        seams: [],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.message.startsWith(TINY_PIECE_MESSAGE_PREFIX))).toBe(false);
    });

    it('fires warning at 1 mm2 below the threshold (999 mm2)', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: TINY_PIECE_THRESHOLD_MM2 - 1 },
        seams: [],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.message.startsWith(TINY_PIECE_MESSAGE_PREFIX))).toBe(true);
    });

    // ── Seam active-field edge cases ──────────────────────────────────────

    it('treats seam with active: undefined as active (no warning)', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [
          {
            id: 's1',
            partnerPieceId: 'p2',
            partnerPieceName: 'Back',
            edgeName: 'side',
            type: 'plain',
            // active is omitted — should default to active
          },
        ],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'geometry')).toBe(false);
    });

    it('does not fire when at least one seam is active among mixed active/inactive', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [
          {
            id: 's1',
            partnerPieceId: 'p2',
            partnerPieceName: 'Back',
            edgeName: 'side',
            type: 'plain',
            active: false,
          },
          {
            id: 's2',
            partnerPieceId: 'p3',
            partnerPieceName: 'Sleeve',
            edgeName: 'armhole',
            type: 'plain',
            active: true,
          },
        ],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'geometry')).toBe(false);
    });

    // ── Diagnostic deduplication ──────────────────────────────────────────

    it('suppresses seam:no-connections when ruleTinyPiece fires (avoids duplicate noise)', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.message.startsWith(TINY_PIECE_MESSAGE_PREFIX))).toBe(true);
      expect(diags.some(d => d.category === 'seam' && d.message.includes('No seam connections'))).toBe(false);
    });

    it('still fires seam:no-connections for normal-sized pieces with no seams', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 5000 },
        seams: [],
      });
      const diags = evaluateRules(data);
      expect(diags.some(d => d.category === 'seam' && d.message.includes('No seam connections'))).toBe(true);
      expect(diags.some(d => d.category === 'geometry')).toBe(false);
    });

    // ── Message constant integrity ────────────────────────────────────────

    it('message starts with the shared TINY_PIECE_MESSAGE_PREFIX constant', () => {
      const data = makeData({
        piece: { ...makeData().piece, area: 100 },
        seams: [],
      });
      const diags = evaluateRules(data);
      const tinyDiag = diags.find(d => d.category === 'geometry');
      expect(tinyDiag).toBeDefined();
      expect(tinyDiag!.message).toMatch(new RegExp(`^${TINY_PIECE_MESSAGE_PREFIX}`));
    });
  });
});
