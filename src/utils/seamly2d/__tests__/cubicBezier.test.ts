/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { resolveConstruction } from '../constructionResolver';
import type { FormulaContext } from '../formulaEvaluator';

describe('cubicBezier support', () => {
  const ctx: FormulaContext = { measurements: {}, variables: {} };

  it('resolves cubicBezier curve and registers Spl_ arc length', () => {
    const steps = [
      { id: 1, type: 'single', name: 'A', x: 0, y: 0 },
      { id: 2, type: 'endLine', name: 'B', basePoint: 1, angle: 0, length: 10 },
      { id: 3, type: 'endLine', name: 'C', basePoint: 1, angle: 90, length: 5 },
      { id: 4, type: 'endLine', name: 'D', basePoint: 2, angle: 90, length: 5 },
      { id: 5, type: 'cubicBezier', name: '', point1: 1, point2: 3, point3: 4, point4: 2 },
    ];

    const { stepCurves } = resolveConstruction(steps as any, ctx);

    // Curve should be registered
    expect(stepCurves.has(5)).toBe(true);
    const cmds = stepCurves.get(5)!;
    expect(cmds).toHaveLength(2); // M + C
    expect(cmds[0].type).toBe('M');
    expect(cmds[1].type).toBe('C');

    // Control points should be at C and D
    const c = cmds[1].values;
    expect(c[0]).toBeCloseTo(0, 0);    // cp1.x = C.x = 0
    expect(c[1]).toBeCloseTo(-5, 0);   // cp1.y = C.y (angle 90 = up = -5)
    expect(c[2]).toBeCloseTo(10, 0);   // cp2.x = D.x = 10
    expect(c[3]).toBeCloseTo(-5, 0);   // cp2.y = D.y
    expect(c[4]).toBeCloseTo(10, 0);   // end.x = B.x
    expect(c[5]).toBeCloseTo(0, 0);    // end.y = B.y
  });

  it('registers Spl_X_Y arc length for cubicBezier', () => {
    const steps = [
      { id: 1, type: 'single', name: 'P1', x: 0, y: 0 },
      { id: 2, type: 'endLine', name: 'P4', basePoint: 1, angle: 0, length: 10 },
      { id: 3, type: 'endLine', name: 'CP1', basePoint: 1, angle: 45, length: 5 },
      { id: 4, type: 'endLine', name: 'CP2', basePoint: 2, angle: 135, length: 5 },
      { id: 5, type: 'cubicBezier', name: '', point1: 1, point2: 3, point3: 4, point4: 2 },
      // cutSpline on this curve — should resolve if arc length is registered
      { id: 6, type: 'cutSpline', name: 'MidPt', spline: 5, length: 'Spl_P1_P4/2' },
    ];

    const { points } = resolveConstruction(steps as any, ctx);
    const midPt = points.get(6);
    expect(midPt).toBeDefined();
    expect(midPt!.x).not.toBe(0);
    expect(midPt!.y).not.toBe(0);
  });

  it('resolves cubicBezier in trousers pattern — Pocket1 not at origin', async () => {
    // Integration test using actual trousers data
    const fs = await import('fs');
    const { adaptSeamlyPattern } = await import('../seamlyAdapter');
    const json = JSON.parse(fs.readFileSync('tools/seamly2d-converter/output/trousers.json', 'utf8'));
    const measurements = { height: 180, bust_circ: 96, waist_circ: 82, hip_circ: 96, shoulder_length: 44, arm_shoulder_tip_to_wrist_bent: 64 };
    const result = adaptSeamlyPattern(json, measurements);

    const pocket1 = result.points.find((p: any) => p.label === 'Pocket1');
    expect(pocket1).toBeDefined();
    expect(pocket1!.x).not.toBe(0);
    expect(pocket1!.y).not.toBe(0);

    const a43 = result.points.find((p: any) => p.label === 'A43');
    expect(a43).toBeDefined();
    expect(a43!.x).not.toBe(0);
    expect(a43!.y).not.toBe(0);
  });
});
