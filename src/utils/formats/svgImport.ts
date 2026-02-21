/**
 * SVG Import — pure TypeScript, no DOM dependencies.
 * Parses SVG files from Illustrator, Inkscape, Figma into PatternPieces.
 */
import { PatternPiece, PathCommand } from '../../types/types';

// ─── Public API ───

export interface SvgImportResult {
  pieces: PatternPiece[];
  warnings: string[];
}

export function importSVG(svgString: string): SvgImportResult {
  const warnings: string[] = [];
  if (!svgString || !svgString.includes('<svg')) {
    warnings.push('No valid SVG content found');
    return { pieces: [], warnings };
  }

  const viewBox = parseViewBox(svgString);
  const rootUnits = parseUnits(svgString);
  const unitScale = getUnitScale(rootUnits);

  // Find max Y for flipping
  const maxY = viewBox ? viewBox.height : 1000;

  const elements = extractElements(svgString, []);
  const closedPaths: { name: string; commands: PathCommand[] }[] = [];
  const openPaths: { commands: PathCommand[] }[] = [];

  let autoIndex = 1;

  for (const el of elements) {
    try {
      const rawCmds = elementToCommands(el);
      if (rawCmds.length === 0) continue;

      // Apply element transform then accumulated group transforms
      const allTransforms = [...el.groupTransforms];
      if (el.transform) allTransforms.push(el.transform);
      const transformed = applyTransformsToCommands(rawCmds, allTransforms);

      // Apply unit scale and flip Y
      const scaled = scaleAndFlipCommands(transformed, unitScale, maxY * unitScale);

      const isClosed = scaled.some(c => c.type === 'Z');
      const name = el.id || el.label || `Piece ${autoIndex}`;

      if (isClosed) {
        closedPaths.push({ name, commands: scaled });
        autoIndex++;
      } else {
        openPaths.push({ commands: scaled });
      }
    } catch (e: any) {
      warnings.push(`Failed to parse element: ${e.message}`);
    }
  }

  const now = Date.now();
  const pieces: PatternPiece[] = closedPaths.map((p, i) => ({
    id: `svg-import-${now}-${i}`,
    name: p.name,
    outline: p.commands,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: now,
    updatedAt: now,
  }));

  return { pieces, warnings };
}

// ─── ViewBox & Units ───

interface ViewBox {
  x: number; y: number; width: number; height: number;
}

function parseViewBox(svg: string): ViewBox | null {
  const m = svg.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (!m) return null;
  const parts = m[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function parseUnits(svg: string): string {
  // Check width attribute for unit suffix
  const m = svg.match(/<svg[^>]*\bwidth\s*=\s*["']([^"']+)["']/);
  if (m) {
    const val = m[1].trim();
    const unitMatch = val.match(/(mm|cm|in|pt|px)$/);
    if (unitMatch) return unitMatch[1];
  }
  return 'px';
}

function getUnitScale(unit: string): number {
  // Convert to mm
  switch (unit) {
    case 'mm': return 1;
    case 'cm': return 10;
    case 'in': return 25.4;
    case 'pt': return 25.4 / 72;
    case 'px': default: return 25.4 / 96;
  }
}

// ─── Element Extraction (pure string parsing) ───

interface SvgElement {
  tag: string;
  attrs: Record<string, string>;
  id?: string;
  label?: string;
  transform?: string;
  groupTransforms: string[];
}

function extractElements(svg: string, parentTransforms: string[]): SvgElement[] {
  const results: SvgElement[] = [];

  const processContent = (content: string, transforms: string[]) => {
    const groupStack: { start: number; attrStr: string }[] = [];
    let depth = 0;
    const groups: { attrs: string; content: string; start: number; end: number }[] = [];
    let pos = 0;

    while (pos < content.length) {
      const openMatch = /<g\b([^>]*)>/gi;
      openMatch.lastIndex = pos;
      const closeMatch = /<\/g>/gi;
      closeMatch.lastIndex = pos;

      const om = openMatch.exec(content);
      const cm = closeMatch.exec(content);

      if (!om && !cm) break;

      const omIdx = om ? om.index : Infinity;
      const cmIdx = cm ? cm.index : Infinity;

      if (omIdx < cmIdx) {
        if (depth === 0) {
          groupStack.push({ start: omIdx + om![0].length, attrStr: om![1] });
        }
        depth++;
        pos = omIdx + om![0].length;
      } else {
        depth--;
        if (depth === 0 && groupStack.length > 0) {
          const top = groupStack.pop()!;
          groups.push({
            attrs: top.attrStr,
            content: content.slice(top.start, cmIdx),
            start: top.start - (top.attrStr.length + 3), // approximate
            end: cmIdx + cm![0].length,
          });
        }
        pos = cmIdx + cm![0].length;
      }
    }

    // Process found groups recursively
    for (const g of groups) {
      const gTransform = extractAttr(g.attrs, 'transform');
      const childTransforms = gTransform ? [...transforms, gTransform] : [...transforms];
      const nested = processContent(g.content, childTransforms);
      results.push(...nested);
    }

    // Find shape elements NOT inside groups
    const shRe = /<(path|rect|circle|ellipse|polygon|polyline|line)\b([^>]*?)\/?\s*>/gi;
    let sm: RegExpExecArray | null;
    const localResults: SvgElement[] = [];

    while ((sm = shRe.exec(content)) !== null) {
      // Check if this element is inside a group we already processed
      const inGroup = groups.some(g => sm!.index >= g.start && sm!.index < g.end);
      if (inGroup) continue;

      const tag = sm[1].toLowerCase();
      const attrStr = sm[2];
      const attrs = parseAttrs(attrStr);
      const elTransform = attrs['transform'] || undefined;
      const id = attrs['id'] || undefined;
      const label = attrs['inkscape:label'] || undefined;

      localResults.push({
        tag,
        attrs,
        id,
        label,
        transform: elTransform,
        groupTransforms: transforms,
      });
    }

    return localResults;
  };

  // Strip everything outside <svg>...</svg>
  const svgContent = svg.replace(/[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*/, '');
  const found = processContent(svgContent, parentTransforms);
  results.push(...found);

  return results;
}

function extractAttr(attrStr: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`);
  const m = attrStr.match(re);
  return m ? m[1] : undefined;
}

function parseAttrs(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

// ─── Element → PathCommands ───

function elementToCommands(el: SvgElement): PathCommand[] {
  switch (el.tag) {
    case 'path': return parseSvgPathD(el.attrs['d'] || '');
    case 'rect': return rectToCommands(el.attrs);
    case 'circle': return circleToCommands(el.attrs);
    case 'ellipse': return ellipseToCommands(el.attrs);
    case 'polygon': return polygonToCommands(el.attrs, true);
    case 'polyline': return polygonToCommands(el.attrs, false);
    case 'line': return lineToCommands(el.attrs);
    default: return [];
  }
}

function rectToCommands(a: Record<string, string>): PathCommand[] {
  const x = num(a['x']), y = num(a['y']), w = num(a['width']), h = num(a['height']);
  return [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x, y + h] },
    { type: 'Z', values: [] },
  ];
}

function circleToCommands(a: Record<string, string>): PathCommand[] {
  const cx = num(a['cx']), cy = num(a['cy']), r = num(a['r']);
  return ellipseToPath(cx, cy, r, r);
}

function ellipseToCommands(a: Record<string, string>): PathCommand[] {
  const cx = num(a['cx']), cy = num(a['cy']), rx = num(a['rx']), ry = num(a['ry']);
  return ellipseToPath(cx, cy, rx, ry);
}

function ellipseToPath(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  // Approximate with 4 cubic beziers
  const k = 0.5522847498; // magic number for circle approximation
  const ox = rx * k, oy = ry * k;
  return [
    { type: 'M', values: [cx - rx, cy] },
    { type: 'C', values: [cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry] },
    { type: 'C', values: [cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy] },
    { type: 'C', values: [cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry] },
    { type: 'C', values: [cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy] },
    { type: 'Z', values: [] },
  ];
}

function polygonToCommands(a: Record<string, string>, closed: boolean): PathCommand[] {
  const pts = (a['points'] || '').trim().split(/[\s,]+/).map(Number);
  if (pts.length < 4) return [];
  const cmds: PathCommand[] = [{ type: 'M', values: [pts[0], pts[1]] }];
  for (let i = 2; i < pts.length; i += 2) {
    cmds.push({ type: 'L', values: [pts[i], pts[i + 1]] });
  }
  if (closed) cmds.push({ type: 'Z', values: [] });
  return cmds;
}

function lineToCommands(a: Record<string, string>): PathCommand[] {
  return [
    { type: 'M', values: [num(a['x1']), num(a['y1'])] },
    { type: 'L', values: [num(a['x2']), num(a['y2'])] },
  ];
}

function num(s: string | undefined): number {
  return s ? parseFloat(s) || 0 : 0;
}

// ─── SVG Path `d` Parser ───

export function parseSvgPathD(d: string): PathCommand[] {
  if (!d) return [];

  const commands: PathCommand[] = [];
  // Tokenize: split into command letters and numbers
  const tokens = tokenizePath(d);
  let i = 0;
  let cx = 0, cy = 0; // current point
  let sx = 0, sy = 0; // subpath start
  let lastCmd = '';
  let lastCx2 = 0, lastCy2 = 0; // last control point for S/T

  function nextNum(): number {
    return i < tokens.length ? tokens[i++] as number : 0;
  }

  function isNumber(idx: number): boolean {
    return idx < tokens.length && typeof tokens[idx] === 'number';
  }

  while (i < tokens.length) {
    let cmd: string;
    if (typeof tokens[i] === 'string') {
      cmd = tokens[i] as string;
      i++;
    } else {
      // Implicit repeat of last command (L after M)
      cmd = lastCmd === 'M' ? 'L' : lastCmd === 'm' ? 'l' : lastCmd;
    }

    const isRel = cmd === cmd.toLowerCase() && cmd !== 'Z' && cmd !== 'z';
    const CMD = cmd.toUpperCase();

    switch (CMD) {
      case 'M': {
        let x = nextNum(), y = nextNum();
        if (isRel) { x += cx; y += cy; }
        cx = x; cy = y; sx = x; sy = y;
        commands.push({ type: 'M', values: [x, y] });
        // Subsequent coordinates are implicit L
        while (isNumber(i)) {
          let lx = nextNum(), ly = nextNum();
          if (isRel) { lx += cx; ly += cy; }
          cx = lx; cy = ly;
          commands.push({ type: 'L', values: [lx, ly] });
        }
        break;
      }
      case 'L': {
        do {
          let x = nextNum(), y = nextNum();
          if (isRel) { x += cx; y += cy; }
          cx = x; cy = y;
          commands.push({ type: 'L', values: [x, y] });
        } while (isNumber(i));
        break;
      }
      case 'H': {
        do {
          let x = nextNum();
          if (isRel) x += cx;
          cx = x;
          commands.push({ type: 'L', values: [cx, cy] });
        } while (isNumber(i));
        break;
      }
      case 'V': {
        do {
          let y = nextNum();
          if (isRel) y += cy;
          cy = y;
          commands.push({ type: 'L', values: [cx, cy] });
        } while (isNumber(i));
        break;
      }
      case 'C': {
        do {
          let x1 = nextNum(), y1 = nextNum(), x2 = nextNum(), y2 = nextNum(), x = nextNum(), y = nextNum();
          if (isRel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
          commands.push({ type: 'C', values: [x1, y1, x2, y2, x, y] });
          lastCx2 = x2; lastCy2 = y2;
          cx = x; cy = y;
        } while (isNumber(i));
        break;
      }
      case 'S': {
        do {
          // Reflect last control point
          let x1 = 2 * cx - lastCx2, y1 = 2 * cy - lastCy2;
          let x2 = nextNum(), y2 = nextNum(), x = nextNum(), y = nextNum();
          if (isRel) { x2 += cx; y2 += cy; x += cx; y += cy; }
          commands.push({ type: 'C', values: [x1, y1, x2, y2, x, y] });
          lastCx2 = x2; lastCy2 = y2;
          cx = x; cy = y;
        } while (isNumber(i));
        break;
      }
      case 'Q': {
        do {
          let x1 = nextNum(), y1 = nextNum(), x = nextNum(), y = nextNum();
          if (isRel) { x1 += cx; y1 += cy; x += cx; y += cy; }
          // Convert quadratic to cubic
          const cp1x = cx + (2 / 3) * (x1 - cx);
          const cp1y = cy + (2 / 3) * (y1 - cy);
          const cp2x = x + (2 / 3) * (x1 - x);
          const cp2y = y + (2 / 3) * (y1 - y);
          commands.push({ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, x, y] });
          lastCx2 = x1; lastCy2 = y1; // store quadratic control for T
          cx = x; cy = y;
        } while (isNumber(i));
        break;
      }
      case 'T': {
        do {
          // Reflect last quadratic control point
          let x1 = 2 * cx - lastCx2, y1 = 2 * cy - lastCy2;
          let x = nextNum(), y = nextNum();
          if (isRel) { x += cx; y += cy; }
          const cp1x = cx + (2 / 3) * (x1 - cx);
          const cp1y = cy + (2 / 3) * (y1 - cy);
          const cp2x = x + (2 / 3) * (x1 - x);
          const cp2y = y + (2 / 3) * (y1 - y);
          commands.push({ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, x, y] });
          lastCx2 = x1; lastCy2 = y1;
          cx = x; cy = y;
        } while (isNumber(i));
        break;
      }
      case 'A': {
        do {
          let rx = nextNum(), ry = nextNum();
          const angle = nextNum();
          const largeArc = nextNum();
          const sweep = nextNum();
          let x = nextNum(), y = nextNum();
          if (isRel) { x += cx; y += cy; }
          // Convert arc to cubics
          const arcCubics = arcToCubics(cx, cy, rx, ry, angle, !!largeArc, !!sweep, x, y);
          for (const c of arcCubics) {
            commands.push({ type: 'C', values: c });
          }
          cx = x; cy = y;
        } while (isNumber(i));
        break;
      }
      case 'Z': {
        commands.push({ type: 'Z', values: [] });
        cx = sx; cy = sy;
        break;
      }
    }

    if (CMD !== 'C' && CMD !== 'S') { lastCx2 = cx; lastCy2 = cy; }
    if (CMD !== 'Q' && CMD !== 'T' && CMD !== 'C' && CMD !== 'S') {
      // Reset reflection for non-curve commands handled above already
    }
    lastCmd = cmd;
  }

  return commands;
}

function tokenizePath(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  // Match command letters or numbers (including negative, decimal, scientific notation)
  const re = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push(m[1]);
    else tokens.push(parseFloat(m[2]));
  }
  return tokens;
}

// ─── Arc to Cubic Bezier Conversion ───

function arcToCubics(
  x1: number, y1: number, rx: number, ry: number,
  angleDeg: number, largeArc: boolean, sweep: boolean,
  x2: number, y2: number
): number[][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];

  const phi = angleDeg * Math.PI / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

  // Step 1: compute (x1', y1')
  const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Step 2: compute (cx', cy')
  rx = Math.abs(rx); ry = Math.abs(ry);
  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }

  const num1 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const sq = Math.max(0, num1 / den);
  const sign = largeArc === sweep ? -1 : 1;
  const k = sign * Math.sqrt(sq);

  const cxp = k * rx * y1p / ry;
  const cyp = -k * ry * x1p / rx;

  // Step 3: compute center
  const cxc = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cyc = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 4: compute theta1 and dtheta
  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  // Split arc into segments <= 90 degrees
  const segments = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
  const delta = dtheta / segments;
  const result: number[][] = [];

  let t = theta1;
  for (let i = 0; i < segments; i++) {
    const cubicPts = arcSegmentToCubic(cxc, cyc, rx, ry, phi, t, t + delta);
    result.push(cubicPts);
    t += delta;
  }

  return result;
}

function vecAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = ux * vx + uy * vy;
  const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
  let cos = dot / len;
  if (cos < -1) cos = -1;
  if (cos > 1) cos = 1;
  return sign * Math.acos(cos);
}

function arcSegmentToCubic(
  cx: number, cy: number, rx: number, ry: number,
  phi: number, theta1: number, theta2: number
): number[] {
  const alpha = Math.sin(theta2 - theta1) * (Math.sqrt(4 + 3 * Math.pow(Math.tan((theta2 - theta1) / 2), 2)) - 1) / 3;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

  const pt = (theta: number): [number, number] => {
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    return [
      cx + cosPhi * rx * cosT - sinPhi * ry * sinT,
      cy + sinPhi * rx * cosT + cosPhi * ry * sinT,
    ];
  };
  const dt = (theta: number): [number, number] => {
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    return [
      -cosPhi * rx * sinT - sinPhi * ry * cosT,
      -sinPhi * rx * sinT + cosPhi * ry * cosT,
    ];
  };

  const [p1x, p1y] = pt(theta1);
  const [p2x, p2y] = pt(theta2);
  const [d1x, d1y] = dt(theta1);
  const [d2x, d2y] = dt(theta2);

  return [
    p1x + alpha * d1x, p1y + alpha * d1y,
    p2x - alpha * d2x, p2y - alpha * d2y,
    p2x, p2y,
  ];
}

// ─── Transform Parsing & Application ───

type Matrix = [number, number, number, number, number, number]; // [a,b,c,d,e,f]

function parseTransform(transform: string): Matrix {
  let result: Matrix = [1, 0, 0, 1, 0, 0]; // identity

  const re = /(translate|rotate|scale|matrix|skewX|skewY)\s*\(([^)]+)\)/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(transform)) !== null) {
    const fn = m[1].toLowerCase();
    const args = m[2].split(/[\s,]+/).map(Number);
    let mat: Matrix;

    switch (fn) {
      case 'translate':
        mat = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
        break;
      case 'scale': {
        const sx = args[0] || 1, sy = args.length > 1 ? args[1] : sx;
        mat = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case 'rotate': {
        const a = (args[0] || 0) * Math.PI / 180;
        const cos = Math.cos(a), sin = Math.sin(a);
        if (args.length >= 3) {
          // rotate(a, cx, cy)
          const cx = args[1], cy = args[2];
          mat = multiplyMatrices(
            [1, 0, 0, 1, cx, cy],
            multiplyMatrices([cos, sin, -sin, cos, 0, 0], [1, 0, 0, 1, -cx, -cy])
          );
        } else {
          mat = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      case 'matrix':
        mat = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'skewx': {
        const t = Math.tan((args[0] || 0) * Math.PI / 180);
        mat = [1, 0, t, 1, 0, 0];
        break;
      }
      case 'skewy': {
        const t = Math.tan((args[0] || 0) * Math.PI / 180);
        mat = [1, t, 0, 1, 0, 0];
        break;
      }
      default:
        mat = [1, 0, 0, 1, 0, 0];
    }

    result = multiplyMatrices(result, mat);
  }

  return result;
}

function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function applyTransformsToCommands(cmds: PathCommand[], transforms: string[]): PathCommand[] {
  if (transforms.length === 0) return cmds;

  // Compose all transforms into one matrix (group transforms first, then element)
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  for (const t of transforms) {
    matrix = multiplyMatrices(matrix, parseTransform(t));
  }

  return cmds.map(cmd => {
    if (cmd.type === 'Z') return cmd;
    const vals = [...cmd.values];
    // Transform all coordinate pairs
    for (let i = 0; i < vals.length; i += 2) {
      const [nx, ny] = applyMatrix(matrix, vals[i], vals[i + 1]);
      vals[i] = nx;
      vals[i + 1] = ny;
    }
    return { type: cmd.type, values: vals };
  });
}

// ─── Scale & Flip Y ───

function scaleAndFlipCommands(cmds: PathCommand[], scale: number, maxY: number): PathCommand[] {
  return cmds.map(cmd => {
    if (cmd.type === 'Z') return cmd;
    const vals = [...cmd.values];
    for (let i = 0; i < vals.length; i += 2) {
      vals[i] = vals[i] * scale;
      vals[i + 1] = maxY - vals[i + 1] * scale;
    }
    return { type: cmd.type, values: vals };
  });
}
