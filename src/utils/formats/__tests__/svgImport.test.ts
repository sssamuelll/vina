import { describe, it, expect } from 'vitest';
import { importSVG, parseSvgPathD } from '../svgImport';

describe('parseSvgPathD', () => {
  it('parses simple M L Z rectangle', () => {
    const cmds = parseSvgPathD('M 0 0 L 100 0 L 100 50 L 0 50 Z');
    expect(cmds).toHaveLength(5);
    expect(cmds[0]).toEqual({ type: 'M', values: [0, 0] });
    expect(cmds[1]).toEqual({ type: 'L', values: [100, 0] });
    expect(cmds[4]).toEqual({ type: 'Z', values: [] });
  });

  it('parses cubic bezier C command', () => {
    const cmds = parseSvgPathD('M 0 0 C 10 20 30 40 50 60');
    expect(cmds).toHaveLength(2);
    expect(cmds[1]).toEqual({ type: 'C', values: [10, 20, 30, 40, 50, 60] });
  });

  it('parses relative commands (m, l, c, z)', () => {
    const cmds = parseSvgPathD('m 10 10 l 50 0 l 0 30 z');
    expect(cmds).toHaveLength(4);
    expect(cmds[0]).toEqual({ type: 'M', values: [10, 10] });
    expect(cmds[1]).toEqual({ type: 'L', values: [60, 10] });
    expect(cmds[2]).toEqual({ type: 'L', values: [60, 40] });
    expect(cmds[3]).toEqual({ type: 'Z', values: [] });
  });

  it('handles H and V commands', () => {
    const cmds = parseSvgPathD('M 0 0 H 100 V 50 H 0 Z');
    expect(cmds).toHaveLength(5);
    expect(cmds[1]).toEqual({ type: 'L', values: [100, 0] });
    expect(cmds[2]).toEqual({ type: 'L', values: [100, 50] });
  });

  it('handles implicit L after M', () => {
    const cmds = parseSvgPathD('M 0 0 100 0 100 50');
    expect(cmds).toHaveLength(3);
    expect(cmds[1]).toEqual({ type: 'L', values: [100, 0] });
    expect(cmds[2]).toEqual({ type: 'L', values: [100, 50] });
  });

  it('handles Q command (quadratic to cubic)', () => {
    const cmds = parseSvgPathD('M 0 0 Q 50 100 100 0');
    expect(cmds).toHaveLength(2);
    expect(cmds[1].type).toBe('C');
    // End point should match
    expect(cmds[1].values[4]).toBeCloseTo(100);
    expect(cmds[1].values[5]).toBeCloseTo(0);
  });

  it('handles A command (arc)', () => {
    const cmds = parseSvgPathD('M 10 80 A 25 25 0 0 1 50 80');
    expect(cmds.length).toBeGreaterThanOrEqual(2);
    // First is M, rest are C segments
    expect(cmds[0].type).toBe('M');
    expect(cmds[1].type).toBe('C');
  });
});

describe('importSVG', () => {
  it('returns empty result with warnings for invalid SVG', () => {
    const result = importSVG('not svg');
    expect(result.pieces).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty result for empty string', () => {
    const result = importSVG('');
    expect(result.pieces).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('parses a simple path into a piece', () => {
    const svg = `<svg viewBox="0 0 200 200"><path id="front" d="M 10 10 L 100 10 L 100 90 L 10 90 Z"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].name).toBe('front');
    expect(result.pieces[0].outline.length).toBe(5); // M L L L Z
  });

  it('parses rect element', () => {
    const svg = `<svg viewBox="0 0 200 200"><rect x="10" y="20" width="80" height="60"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].outline.length).toBe(5);
  });

  it('parses circle element', () => {
    const svg = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="50"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    // Circle = M + 4C + Z = 6 commands
    expect(result.pieces[0].outline.length).toBe(6);
  });

  it('parses polygon element', () => {
    const svg = `<svg viewBox="0 0 200 200"><polygon points="50,0 100,100 0,100"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].outline.length).toBe(4); // M L L Z
  });

  it('handles transforms (translate)', () => {
    const svg = `<svg viewBox="0 0 200 200"><g transform="translate(10, 20)"><path d="M 0 0 L 50 0 L 50 50 L 0 50 Z"/></g></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    // The M command should be translated
    const m = result.pieces[0].outline[0];
    expect(m.type).toBe('M');
    // x should include translation (10 * unitScale), y should be flipped
    // With px units: scale = 25.4/96 ≈ 0.2646
    // x = (0 + 10) * scale = 10 * 0.2646 ≈ 2.646
    expect(m.values[0]).toBeCloseTo(10 * 25.4 / 96, 1);
  });

  it('handles transforms (scale)', () => {
    const svg = `<svg viewBox="0 0 200 200"><g transform="scale(2)"><path d="M 10 10 L 20 10 L 20 20 L 10 20 Z"/></g></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    // x of first point should be 20 * scale (scaled by 2 then by unit scale)
    const m = result.pieces[0].outline[0];
    expect(m.values[0]).toBeCloseTo(20 * 25.4 / 96, 1);
  });

  it('parses multiple paths as multiple pieces', () => {
    const svg = `<svg viewBox="0 0 200 200">
      <path id="front" d="M 0 0 L 50 0 L 50 50 Z"/>
      <path id="back" d="M 60 0 L 110 0 L 110 50 Z"/>
    </svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(2);
    expect(result.pieces[0].name).toBe('front');
    expect(result.pieces[1].name).toBe('back');
  });

  it('uses inkscape:label for piece names', () => {
    const svg = `<svg viewBox="0 0 200 200"><path inkscape:label="Sleeve" d="M 0 0 L 50 0 L 50 50 Z"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces[0].name).toBe('Sleeve');
  });

  it('auto-generates piece names when no id', () => {
    const svg = `<svg viewBox="0 0 200 200"><path d="M 0 0 L 50 0 L 50 50 Z"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces[0].name).toBe('Piece 1');
  });

  it('handles SVG with mm units', () => {
    const svg = `<svg width="200mm" height="200mm" viewBox="0 0 200 200"><rect x="0" y="0" width="100" height="50"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    // With mm units, scale = 1, so rect width in outline should be ~100mm
    const outline = result.pieces[0].outline;
    const m = outline[0]; // M 0, flipped_y
    const l1 = outline[1]; // L 100, flipped_y
    expect(l1.values[0] - m.values[0]).toBeCloseTo(100, 0);
  });

  it('handles SVG with in units', () => {
    const svg = `<svg width="10in" height="10in" viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1"/></svg>`;
    const result = importSVG(svg);
    // 1 inch = 25.4mm
    const outline = result.pieces[0].outline;
    const m = outline[0];
    const l1 = outline[1];
    expect(l1.values[0] - m.values[0]).toBeCloseTo(25.4, 0);
  });

  it('parses viewBox correctly', () => {
    const svg = `<svg viewBox="10 20 300 400"><path d="M 10 20 L 100 20 L 100 100 Z"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
  });

  it('ignores open paths (no Z)', () => {
    const svg = `<svg viewBox="0 0 200 200">
      <path d="M 0 0 L 50 0 L 50 50 Z"/>
      <line x1="0" y1="0" x2="100" y2="100"/>
    </svg>`;
    const result = importSVG(svg);
    // Only the closed path becomes a piece
    expect(result.pieces).toHaveLength(1);
  });

  it('handles ellipse element', () => {
    const svg = `<svg viewBox="0 0 200 200"><ellipse cx="100" cy="50" rx="80" ry="30"/></svg>`;
    const result = importSVG(svg);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].outline.length).toBe(6);
  });
});
