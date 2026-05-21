/**
 * Targeted test: Load tshirt_test.json through the full pipeline
 * adaptSeamlyPattern → buildPiece → meshPiece (CDT)
 *
 * Diagnoses the "Meshing failed for piece" issue that blocks simulation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { adaptSeamlyPattern } from '../seamlyAdapter';
import { buildPiece } from '../../construction/pieceBuilder';
import { meshPiece } from '../../mesh/cdtMesher';
import type { FormulaContext } from '../formulaEvaluator';

const PATTERN_PATH = join(__dirname, '../../../../tools/seamly2d-converter/output/tshirt_test.json');

// Simulation init uses these options (from simulationInitClient.ts)
const SIM_MESH_CONFIG = {
  yHeight: 0,
  scale: 0.001,
  maxEdgeLength: 5, // default particleDistance
  minAngle: 25,
  maxRefinementPasses: 3,
  curveResolution: 12,
};

// File-level timeout: CDT meshing on Linux CI runs ~10× slower than local
// (15s local → 60-120s CI). Default vitest 5s timeout is wildly insufficient
// for any test that calls meshPiece(). 180s covers current + future cases.
describe('T-Shirt Meshing Pipeline', { timeout: 180000 }, () => {
  const raw = JSON.parse(readFileSync(PATTERN_PATH, 'utf-8'));
  const adapted = adaptSeamlyPattern(raw, {});

  const ctx: FormulaContext = {
    measurements: {},
    variables: adapted.variables ?? {},
  };

  it('should adapt the pattern without errors', () => {
    console.log(`Adapted: ${adapted.points.length} points, ${adapted.curves.length} curves, ${adapted.pieces.length} pieces`);
    console.log(`Errors: ${adapted.errors.length}`);
    for (const e of adapted.errors) console.log(`  ❌ ${e}`);
    expect(adapted.pieces.length).toBe(5);
  });

  it('should build all 5 pieces with valid outlines', () => {
    for (const cPiece of adapted.pieces) {
      const piece = buildPiece(cPiece, adapted.points, adapted.curves, ctx);
      console.log(`\nPiece "${cPiece.name}" (${cPiece.id}):`);
      console.log(`  Outline commands: ${piece.outline.length}`);
      console.log(`  Command types: ${piece.outline.map(c => c.type).join(', ')}`);

      // Check for NaN/Infinity in coordinates
      let hasInvalid = false;
      for (const cmd of piece.outline) {
        for (const v of cmd.values) {
          if (!Number.isFinite(v)) {
            console.log(`  ⚠️ Invalid value in ${cmd.type}: ${v}`);
            hasInvalid = true;
          }
        }
      }
      if (!hasInvalid) console.log(`  ✅ All coordinate values are finite`);

      // Compute bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let cx = 0, cy = 0;
      for (const cmd of piece.outline) {
        if (cmd.type === 'Z') continue;
        const vals = cmd.values;
        let ex = cx, ey = cy;
        if (cmd.type === 'M' || cmd.type === 'L') { ex = vals[0]; ey = vals[1]; }
        else if (cmd.type === 'H') { ex = vals[0]; }
        else if (cmd.type === 'V') { ey = vals[0]; }
        else if (cmd.type === 'C') { ex = vals[4]; ey = vals[5]; }
        if (ex < minX) minX = ex; if (ex > maxX) maxX = ex;
        if (ey < minY) minY = ey; if (ey > maxY) maxY = ey;
        cx = ex; cy = ey;
      }
      console.log(`  Bounding box: ${Math.round(maxX - minX)}mm × ${Math.round(maxY - minY)}mm`);
      console.log(`  Origin: (${Math.round(minX)}, ${Math.round(minY)})`);

      expect(piece.outline.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('should mesh all 5 pieces with CDT (simulation config)', () => {
    let meshOk = 0;
    let meshFail = 0;

    for (const cPiece of adapted.pieces) {
      const piece = buildPiece(cPiece, adapted.points, adapted.curves, ctx);

      console.log(`\nMeshing "${cPiece.name}":`);
      console.log(`  Outline: ${piece.outline.length} commands [${piece.outline.map(c => c.type).join(',')}]`);

      try {
        const start = performance.now();
        const result = meshPiece(piece, SIM_MESH_CONFIG);
        const elapsed = (performance.now() - start).toFixed(0);
        const numVerts = result.vertices.length / 3;
        const numTris = result.triIds.length / 3;

        if (numVerts > 0 && numTris > 0) {
          console.log(`  ✅ ${numVerts} vertices, ${numTris} triangles (${elapsed}ms)`);
          meshOk++;
        } else {
          console.log(`  ❌ EMPTY MESH — 0 vertices or 0 triangles (${elapsed}ms)`);
          meshFail++;
        }
      } catch (err) {
        console.log(`  ❌ EXCEPTION: ${err}`);
        meshFail++;
      }
    }

    console.log(`\n=== Meshing Results: ${meshOk}/${meshOk + meshFail} succeeded ===`);
    expect(meshFail).toBe(0);
  });

  it('should also mesh with default config (larger maxEdgeLength)', () => {
    // Test with default config to see if it's a particle distance issue
    const defaultConfig = {
      yHeight: 1.2,
      scale: 0.001,
      maxEdgeLength: 15, // default cdtMesher config
      minAngle: 25,
      maxRefinementPasses: 3,
      curveResolution: 12,
    };

    let meshOk = 0;
    for (const cPiece of adapted.pieces) {
      const piece = buildPiece(cPiece, adapted.points, adapted.curves, ctx);
      const result = meshPiece(piece, defaultConfig);
      const numVerts = result.vertices.length / 3;
      const numTris = result.triIds.length / 3;
      console.log(`"${cPiece.name}" default: ${numVerts} verts, ${numTris} tris`);
      if (numVerts > 0) meshOk++;
    }
    console.log(`Default config: ${meshOk}/5 succeeded`);
  });
});
