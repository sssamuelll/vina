/**
 * Seamly2D Pattern Template Engine
 *
 * Loads converted Seamly2D JSON patterns and generates PatternPiece[]
 * at runtime given body measurements.
 */

import type { BodyMeasurements, PatternPiece, PathCommand } from '../../types/types';
import { resolveVariables, type VariableDefinition, type FormulaContext } from './formulaEvaluator';
import { resolveConstruction, type ConstructionStep } from './constructionResolver';

// ─── Seamly2D JSON Schema Types ───

export interface SeamlyPattern {
  name: string;
  source?: string;
  unit?: string;
  measurements?: {
    required?: string[];
    defaults?: Record<string, number>;
  };
  variables: Record<string, VariableDefinition>;
  construction: ConstructionStep[];
  pieces?: SeamlyPiece[];
}

export interface SeamlyPiece {
  name: string;
  block?: string;
  nodes?: Array<{ id: number; type?: string; reverse?: boolean }>;
  seamAllowance?: number;
}

// ─── Measurement mapping: BodyMeasurements → Seamly2D names ───

function mapMeasurements(m: BodyMeasurements): Record<string, number> {
  const map: Record<string, number> = {};
  const pairs: [string, number | undefined][] = [
    ['height', m.height],
    ['bust_circ', m.chest],
    ['waist_circ', m.waist],
    ['hip_circ', m.hips],
    ['shoulder_length', m.shoulder],
    ['arm_shoulder_tip_to_wrist_bent', m.armLength],
    ['leg_crotch_to_floor', m.inseam],
    ['neck_circ', m.neckCirc],
    ['highbust_circ', m.highBust],
    ['lowbust_circ', m.lowBust],
    ['rib_circ', m.ribCirc],
    ['highhip_circ', m.highHip],
    ['neck_back_to_waist_b', m.neckToWaistBack],
    ['neck_back_to_waist_f', m.neckToWaistFront],
    ['shoulder_tip_to_waist_front', m.shoulderToWaistFront],
    ['shoulder_tip_to_waist_back', m.shoulderToWaistBack],
    ['waist_to_hip_f', m.waistToHipFront],
    ['waist_to_hip_b', m.waistToHipBack],
    ['waist_to_knee', m.waistToKnee],
    ['waist_to_floor', m.waistToFloor],
    ['crotch_length', m.crotchLength],
    ['shoulder_width', m.shoulderWidth],
  ];

  for (const [key, val] of pairs) {
    if (val !== undefined) {
      map[key] = val;
    }
  }
  return map;
}

// ─── Template Engine ───

export class PatternTemplateEngine {
  private pattern: SeamlyPattern | null = null;

  /** Load a converted Seamly2D pattern JSON. */
  loadPattern(json: SeamlyPattern): void {
    this.pattern = json;
  }

  /** Generate pattern pieces for the given body measurements. */
  generate(measurements: BodyMeasurements): PatternPiece[] {
    if (!this.pattern) throw new Error('No pattern loaded');

    const measMap = mapMeasurements(measurements);

    // Merge pattern defaults
    if (this.pattern.measurements?.defaults) {
      for (const [k, v] of Object.entries(this.pattern.measurements.defaults)) {
        if (measMap[k] === undefined) measMap[k] = v;
      }
    }

    // Resolve variables
    const resolved = resolveVariables(this.pattern.variables, measMap);

    // Build construction
    const context: FormulaContext = { measurements: measMap, variables: resolved };
    const { points, curves } = resolveConstruction(this.pattern.construction, context);

    // Build pieces
    const pieces: PatternPiece[] = [];

    if (this.pattern.pieces && this.pattern.pieces.length > 0) {
      for (const piece of this.pattern.pieces) {
        const outline: PathCommand[] = [];
        if (piece.nodes && piece.nodes.length > 0) {
          const nodePoints = piece.nodes
            .map(n => points.get(n.id))
            .filter((p): p is { x: number; y: number } => p !== undefined);

          if (nodePoints.length > 0) {
            outline.push({ type: 'M', values: [nodePoints[0].x, nodePoints[0].y] });
            for (let i = 1; i < nodePoints.length; i++) {
              outline.push({ type: 'L', values: [nodePoints[i].x, nodePoints[i].y] });
            }
            outline.push({ type: 'Z', values: [] });
          }
        }

        const now = Date.now();
        pieces.push({
          id: `${this.pattern.name}_${piece.name}`,
          name: piece.name,
          outline: outline.length > 0 ? outline : curves,
          internals: [],
          position: { x: 0, y: 0 },
          rotation: 0,
          mirrored: false,
          seamAllowance: piece.seamAllowance ?? 10,
          layer: 1,
          sublayer: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      // No pieces defined — template has construction data but no piece outlines.
      // Don't create garbage by connecting random construction points.
      // The caller should use the construction engine / recipes instead.
      throw new Error(
        'Template has construction data but no piece definitions. ' +
        'Use a blueprint (searchBlueprints) or the construction engine to build pieces from this pattern.'
      );
    }

    return pieces;
  }
}
