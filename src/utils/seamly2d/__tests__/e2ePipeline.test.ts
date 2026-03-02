/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * E2E test: Load ALL converted Seamly2D patterns through the full pipeline
 * adaptSeamlyPattern → buildPiece
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { adaptSeamlyPattern } from '../seamlyAdapter';
import { buildPiece } from '../../construction/pieceBuilder';
import type { FormulaContext } from '../formulaEvaluator';

const OUTPUT_DIR = join(__dirname, '../../../../tools/seamly2d-converter/output');

/**
 * Standard measurement defaults for patterns that reference measurements
 * without providing defaults. Based on a medium-sized adult female.
 * All values in cm (Seamly2D standard unit).
 */
const STANDARD_MEASUREMENTS: Record<string, number> = {
  // Height measurements
  height: 168,
  height_waist_side: 107,
  height_knee: 50,
  height_neck_back: 148,
  height_armpit: 126,
  height_hip: 95,

  // Circumferences
  bust_circ: 92,
  waist_circ: 74,
  hip_circ: 98,
  highhip_circ: 90,
  lowbust_circ: 82,
  neck_circ: 38,
  armscye_circ: 42,
  leg_thigh_mid_circ: 56,
  leg_knee_circ: 38,
  leg_ankle_circ: 22,
  leg_ankle_high_circ: 24,
  hand_circ: 20,

  // Back measurements
  neck_back_to_waist_b: 42,
  armfold_to_armfold_b: 38,
  across_back: 36,

  // Front measurements
  neck_side_to_waist_f: 44,
  neck_front_to_bust_f: 26,
  bustpoint_to_bustpoint: 20,
  bustpoint_to_bustpoint_halter: 32,
  across_chest_f: 34,

  // Shoulder/Arm measurements
  shoulder_length: 13,
  arm_shoulder_tip_to_wrist_bent: 58,
  armpit_to_waist_side: 22,

  // Other
  leg_crotch_to_floor: 78,
};

function loadPatterns() {
  const files = readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => ({
    name: f.replace('.json', ''),
    data: JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf-8')),
  }));
}

describe('Seamly2D E2E Pipeline', () => {
  const patterns = loadPatterns();
  const patternsWithPieces = patterns.filter(p => p.data.pieces?.length > 0);

  it('should have patterns with pieces', () => {
    expect(patternsWithPieces.length).toBeGreaterThan(0);
    console.log(`Found ${patternsWithPieces.length} patterns with pieces out of ${patterns.length} total`);
  });

  it('pipeline summary', { timeout: 120000 }, () => {
    let totalPieces = 0, builtOk = 0, _buildFail = 0, adaptFail = 0;
    const errors: Record<string, number> = {};

    for (const { name, data } of patternsWithPieces) {
      try {
        const adapted = adaptSeamlyPattern(data, STANDARD_MEASUREMENTS);
        if (!adapted) { adaptFail++; continue; }

        const points = adapted.points || [];
        const curves = adapted.curves || [];
        const ctx: FormulaContext = { measurements: {}, variables: adapted.variables || {} };

        for (const piece of adapted.pieces || []) {
          totalPieces++;
          try {
            const result = buildPiece(piece, points, curves, ctx);
            if (result?.outline?.length > 0) builtOk++;
            else {
              errors['Empty result'] = (errors['Empty result'] || 0) + 1;
            }
          } catch (e: any) {
            _buildFail++;
            const msg = (e.message || 'unknown').slice(0, 100);
            errors[msg] = (errors[msg] || 0) + 1;
            if (msg.includes('Math.cos')) console.error(`  MATH.COS in [${name}] piece "${piece.name}" nodes:${piece.nodes.length}`);
          }
        }
      } catch (e: any) {
        adaptFail++;
        const msg = `adapt:${(e.message || '').slice(0, 80)}`;
        errors[msg] = (errors[msg] || 0) + 1;
        console.error(`ADAPT FAIL [${name}]: ${(e.message || '').slice(0, 120)}`);
      }
    }

    console.log(`\n=== E2E Pipeline Results ===`);
    console.log(`Patterns: ${patternsWithPieces.length} | Adapt failures: ${adaptFail}`);
    console.log(`Pieces: ${totalPieces} | ✅ ${builtOk} | ❌ ${totalPieces - builtOk}`);
    console.log(`Success: ${totalPieces > 0 ? ((builtOk / totalPieces) * 100).toFixed(1) : 0}%`);
    console.log(`\n--- Top Errors ---`);
    Object.entries(errors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([msg, count]) => console.log(`  ${count}x ${msg}`));

    // Don't assert 100% — just log results
    expect(totalPieces).toBeGreaterThan(0);
  });
});
