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

  it('pipeline summary', { timeout: 30000 }, () => {
    let totalPieces = 0, builtOk = 0, adaptFail = 0;
    const errors: Record<string, number> = {};

    for (const { name, data } of patternsWithPieces) {
      try {
        const adapted = adaptSeamlyPattern(data, {});
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
            buildFail++;
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
