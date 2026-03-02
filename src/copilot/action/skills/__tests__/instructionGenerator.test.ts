/**
 * Tests for Instruction Generator.
 */
import { describe, it, expect } from 'vitest';
import { generateInstruction, getToolCalls } from '../instructionGenerator';

describe('generateInstruction', () => {
  it('generates instruction for single point', () => {
    const step = { id: 1, name: 'A', type: 'single', x: 0, y: 0 };
    expect(generateInstruction(step)).toBe('Mark point A at coordinates (0, 0)');
  });

  it('generates instruction for endLine', () => {
    const step = { id: 2, name: 'B', type: 'endLine', basePoint: 1, angle: 90, length: 'chest/4' };
    const instruction = generateInstruction(step);
    expect(instruction).toContain('point 1');
    expect(instruction).toContain('90°');
    expect(instruction).toContain('chest/4');
    expect(instruction).toContain('B');
  });

  it('generates instruction for alongLine', () => {
    const step = { id: 3, name: 'C', type: 'alongLine', firstPoint: 1, secondPoint: 2, length: 15 };
    const instruction = generateInstruction(step);
    expect(instruction).toContain('1');
    expect(instruction).toContain('2');
    expect(instruction).toContain('15');
  });

  it('generates instruction for spline', () => {
    const step = { id: 4, name: '', type: 'spline', point1: 1, point4: 2, angle1: 45, angle2: 135 };
    const instruction = generateInstruction(step);
    expect(instruction).toContain('curve');
    expect(instruction).toContain('1');
    expect(instruction).toContain('2');
  });

  it('generates instruction for line', () => {
    const step = { id: 5, name: '', type: 'line', firstPoint: 1, secondPoint: 2 };
    const instruction = generateInstruction(step);
    expect(instruction).toContain('line');
    expect(instruction).toContain('1');
    expect(instruction).toContain('2');
  });

  it('generates instruction for arc', () => {
    const step = { id: 6, name: '', type: 'arc_simple', center: 1, radius: 10, angle1: 0, angle2: 90 };
    const instruction = generateInstruction(step);
    expect(instruction).toContain('arc');
    expect(instruction).toContain('1');
  });

  it('returns fallback for unknown type', () => {
    const step = { id: 99, name: 'X', type: 'unknownType' };
    const instruction = generateInstruction(step);
    expect(instruction).toContain('unknownType');
    expect(instruction).toContain('X');
  });
});

describe('getToolCalls', () => {
  it('returns createPoint for point types', () => {
    expect(getToolCalls('single')).toContain('createPoint');
    expect(getToolCalls('endLine')).toContain('createPoint');
    expect(getToolCalls('alongLine')).toContain('createPoint');
    expect(getToolCalls('normal')).toContain('createPoint');
  });

  it('returns createCurve for spline types', () => {
    expect(getToolCalls('spline')).toContain('createCurve');
    expect(getToolCalls('splinePath')).toContain('createCurve');
  });

  it('returns createLine for line', () => {
    expect(getToolCalls('line')).toContain('createLine');
  });

  it('returns createArc for arc types', () => {
    expect(getToolCalls('arc_simple')).toContain('createArc');
  });

  it('returns empty array for unknown type', () => {
    expect(getToolCalls('unknownType')).toEqual([]);
  });
});
