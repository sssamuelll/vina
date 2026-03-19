/**
 * Rule Engine — evaluates deterministic diagnostic rules against InspectionData.
 *
 * Each rule is a pure function that accepts InspectionData and returns zero or
 * more Diagnostic objects. `evaluateRules` collects all results and sorts them
 * by severity (error → critical → warning → info).
 *
 * @module ruleEngine
 */

import type { InspectionData, Diagnostic, DiagnosticSeverity } from './types';

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  error: 0,
  critical: 1,
  warning: 2,
  info: 3,
};

// ─── Rule type ────────────────────────────────────────────────────────────────

type Rule = (data: InspectionData) => Diagnostic[];

// ─── Fabric rules ─────────────────────────────────────────────────────────────

const ruleNoFabric: Rule = (data) => {
  if (data.fabric === undefined) {
    return [
      {
        severity: 'error',
        category: 'fabric',
        message: 'No fabric assigned',
        detail: 'A fabric must be assigned before the piece can be simulated or exported.',
      },
    ];
  }
  return [];
};

const ruleFabricHeavyWeight: Rule = (data) => {
  if (data.fabric !== undefined && data.fabric.weight > 400) {
    return [
      {
        severity: 'warning',
        category: 'fabric',
        message: `Fabric weight is ${data.fabric.weight} gsm (> 400 gsm)`,
        detail:
          'Heavy fabrics may cause simulation instability and require increased substeps.',
      },
    ];
  }
  return [];
};

// ─── Seam allowance rules ─────────────────────────────────────────────────────

const ruleSeamAllowanceZero: Rule = (data) => {
  if (data.piece.seamAllowance === 0) {
    return [
      {
        severity: 'error',
        category: 'seam-allowance',
        message: 'Seam allowance is 0 mm',
        detail: 'A seam allowance of 0 mm will cause seams to fail during construction.',
      },
    ];
  }
  return [];
};

const ruleSeamAllowanceTooSmall: Rule = (data) => {
  const sa = data.piece.seamAllowance;
  if (sa > 0 && sa < 3) {
    return [
      {
        severity: 'warning',
        category: 'seam-allowance',
        message: `Seam allowance is ${sa} mm (< 3 mm)`,
        detail: 'Very small seam allowances are difficult to sew and prone to fraying.',
      },
    ];
  }
  return [];
};

// ─── Seam connection rules ────────────────────────────────────────────────────

const ruleNoSeamConnections: Rule = (data) => {
  if (data.seams.length === 0) {
    return [
      {
        severity: 'warning',
        category: 'seam',
        message: 'No seam connections defined',
        detail: 'This piece has no seam connections to other pieces.',
      },
    ];
  }
  return [];
};

// ─── Internals rules ──────────────────────────────────────────────────────────

const ruleNoGrainline: Rule = (data) => {
  const hasGrainline = data.internals.some((i) => i.type === 'grainline');
  if (!hasGrainline) {
    return [
      {
        severity: 'warning',
        category: 'internals',
        message: 'No grainline defined',
        detail:
          'A grainline is required for correct fabric alignment during simulation and cutting.',
      },
    ];
  }
  return [];
};

const ruleNoNotches: Rule = (data) => {
  const hasNotch = data.internals.some((i) => i.type === 'notch');
  if (!hasNotch) {
    return [
      {
        severity: 'info',
        category: 'internals',
        message: 'No notches defined',
        detail: 'Notches help align pieces during sewing. Consider adding them to seam edges.',
      },
    ];
  }
  return [];
};

// ─── Fit rules ────────────────────────────────────────────────────────────────

const ruleFitBodyPenetration: Rule = (data) => {
  if (
    data.simulation !== undefined &&
    data.simulation.collisionDistance !== undefined &&
    data.simulation.collisionDistance < 0
  ) {
    return [
      {
        severity: 'critical',
        category: 'fit',
        message: `Body penetration detected (collision distance: ${data.simulation.collisionDistance.toFixed(1)} mm)`,
        detail:
          'The cloth is intersecting the avatar body. Check simulation collision settings.',
      },
    ];
  }
  return [];
};

const ruleFitPressurePoint: Rule = (data) => {
  if (
    data.simulation !== undefined &&
    data.simulation.collisionDistance !== undefined &&
    data.simulation.collisionDistance >= 0 &&
    data.simulation.collisionDistance < 2
  ) {
    return [
      {
        severity: 'warning',
        category: 'fit',
        message: `Pressure point detected (collision distance: ${data.simulation.collisionDistance.toFixed(1)} mm)`,
        detail:
          'Cloth is very close to the body surface. This may indicate a tight spot or pressure point.',
      },
    ];
  }
  return [];
};

// ─── Simulation rules ─────────────────────────────────────────────────────────

const ruleNotSimulated: Rule = (data) => {
  if (
    data.simulation !== undefined &&
    data.simulation.particleCount !== undefined &&
    data.simulation.particleCount === 0
  ) {
    return [
      {
        severity: 'warning',
        category: 'simulation',
        message: 'Piece has not been simulated (particle count is 0)',
        detail: 'Run the cloth simulation to generate fit diagnostics for this piece.',
      },
    ];
  }
  return [];
};

// ─── Construction rules ───────────────────────────────────────────────────────

const ruleNoEdgesDefined: Rule = (data) => {
  if (data.edge === undefined && data.target.type !== 'piece') {
    return [
      {
        severity: 'warning',
        category: 'construction',
        message: 'Piece has no edges defined',
        detail: 'Edges are required for seam connections, SA application, and simulation meshing.',
      },
    ];
  }
  return [];
};

// ─── Layer rules ──────────────────────────────────────────────────────────────

const ruleLayerOverlap: Rule = (data) => {
  const diags: Diagnostic[] = [];
  // ── Layer overlap check
  if (data.piecesOnSameLayer && data.piecesOnSameLayer.length > 0 && data.bodyRegion) {
    const sameRegion = data.piecesOnSameLayer.filter(p => p.bodyRegion === data.bodyRegion);
    if (sameRegion.length > 0) {
      const names = sameRegion.map(p => p.name).join(', ');
      diags.push({
        severity: 'warning',
        category: 'layer',
        message: `Same layer and body region as: ${names}`,
        detail: 'Pieces on the same layer in the same body region may overlap. Consider assigning different layers.',
      });
    }
  }
  return diags;
};

// ─── Rule registry ────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  // fabric
  ruleNoFabric,
  ruleFabricHeavyWeight,
  // seam allowance
  ruleSeamAllowanceZero,
  ruleSeamAllowanceTooSmall,
  // seam
  ruleNoSeamConnections,
  // internals
  ruleNoGrainline,
  ruleNoNotches,
  // fit
  ruleFitBodyPenetration,
  ruleFitPressurePoint,
  // simulation
  ruleNotSimulated,
  // construction
  ruleNoEdgesDefined,
  // layer
  ruleLayerOverlap,
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all diagnostic rules against the provided inspection data.
 *
 * @returns Array of Diagnostic objects sorted by severity
 *          (error → critical → warning → info).
 */
export function evaluateRules(data: InspectionData): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const rule of RULES) {
    const results = rule(data);
    diagnostics.push(...results);
  }

  return diagnostics.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
