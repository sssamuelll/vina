/**
 * Seamly2D XML Parser — browser-compatible parser for .sm2d files.
 *
 * Parses Seamly2D pattern files (.sm2d, .val) and extracts construction
 * steps, pieces, variables, and measurements in a format ready for
 * conversion to Vina skills.
 *
 * @module skills/seamlyParser
 */
import { XMLParser } from 'fast-xml-parser';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SeamlyConstructionStep {
  id: number;
  name: string;
  type: string;
  block?: string;
  [key: string]: unknown;
}

export interface SeamlyPieceNode {
  id: number;
  type: string;
  reverse?: boolean;
}

export interface SeamlyPiece {
  name: string;
  closed: boolean;
  seamAllowance: number;
  width: number;
  nodes: SeamlyPieceNode[];
}

export interface SeamlyPattern {
  name: string;
  unit: string;
  measurements: {
    required: string[];
    defaults: Record<string, number>;
  };
  variables: Record<string, { formula: string; description: string }>;
  construction: SeamlyConstructionStep[];
  pieces: SeamlyPiece[];
}

// ─── Parser Configuration ────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  isArray: (name) =>
    [
      'increment',
      'point',
      'line',
      'spline',
      'arc',
      'pathPoint',
      'piece',
      'detail',
      'node',
      'm',
      'draftBlock',
      'draw',
      'operation',
    ].includes(name),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function attr(el: unknown, name: string): unknown {
  if (!el || typeof el !== 'object') return undefined;
  return (el as Record<string, unknown>)[`@_${name}`];
}

// ─── Construction Extraction ─────────────────────────────────────────────────

function extractConstruction(calc: unknown, blockName: string): SeamlyConstructionStep[] {
  const steps: SeamlyConstructionStep[] = [];
  if (!calc || typeof calc !== 'object') return steps;

  const calcObj = calc as Record<string, unknown>;

  // Points
  for (const p of ensureArray(calcObj.point)) {
    const step: SeamlyConstructionStep = {
      id: attr(p, 'id') as number,
      name: (attr(p, 'name') as string) ?? '',
      type: attr(p, 'type') as string,
      block: blockName,
    };

    // Copy all relevant attributes
    if (p && typeof p === 'object') {
      const pObj = p as Record<string, unknown>;
      for (const key of Object.keys(pObj)) {
        if (key.startsWith('@_') && !['id', 'name', 'type', 'mx', 'my'].includes(key.slice(2))) {
          step[key.slice(2)] = pObj[key];
        }
      }
    }
    steps.push(step);
  }

  // Lines
  for (const l of ensureArray(calcObj.line)) {
    steps.push({
      id: attr(l, 'id') as number,
      name: '',
      type: 'line',
      block: blockName,
      firstPoint: attr(l, 'firstPoint'),
      secondPoint: attr(l, 'secondPoint'),
    });
  }

  // Splines
  for (const s of ensureArray(calcObj.spline)) {
    const sType = attr(s, 'type') as string;
    const isPath = sType === 'pathInteractive' || sType === 'path';

    steps.push({
      id: attr(s, 'id') as number,
      name: '',
      type: isPath ? 'splinePath' : 'spline',
      block: blockName,
      point1: attr(s, 'point1'),
      point4: attr(s, 'point4'),
      angle1: attr(s, 'angle1'),
      angle2: attr(s, 'angle2'),
      length1: attr(s, 'length1'),
      length2: attr(s, 'length2'),
    });
  }

  // Arcs
  for (const a of ensureArray(calcObj.arc)) {
    const aType = attr(a, 'type') as string;
    steps.push({
      id: attr(a, 'id') as number,
      name: '',
      type: `arc_${aType}`,
      block: blockName,
      center: attr(a, 'center'),
      radius: attr(a, 'radius'),
      angle1: attr(a, 'angle1'),
      angle2: attr(a, 'angle2'),
      length: attr(a, 'length'),
    });
  }

  // Operations (rotation, flipping, moving)
  for (const op of ensureArray(calcObj.operation)) {
    const opType = attr(op, 'type') as string;
    steps.push({
      id: attr(op, 'id') as number,
      name: (attr(op, 'suffix') as string) ?? '',
      type: `op_${opType}`,
      block: blockName,
      center: attr(op, 'center'),
      angle: attr(op, 'angle'),
      p1Line: attr(op, 'p1Line'),
      p2Line: attr(op, 'p2Line'),
      axisType: attr(op, 'axisType'),
      length: attr(op, 'length'),
    });
  }

  return steps;
}

// ─── Piece Extraction ────────────────────────────────────────────────────────

function extractPieces(piecesNode: unknown): SeamlyPiece[] {
  if (!piecesNode || typeof piecesNode !== 'object') return [];

  const piecesObj = piecesNode as Record<string, unknown>;
  const rawPieces = [...ensureArray(piecesObj.piece), ...ensureArray(piecesObj.detail)];
  const pieces: SeamlyPiece[] = [];

  for (const p of rawPieces) {
    if (!p || typeof p !== 'object') continue;
    const pObj = p as Record<string, unknown>;

    // Nodes can be under <nodes><node> or directly <node>
    const nodesContainer = pObj.nodes as Record<string, unknown> | undefined;
    const nodeList = nodesContainer?.node ?? pObj.node;
    const nodes: SeamlyPieceNode[] = ensureArray(nodeList).map((n: unknown) => ({
      id: attr(n, 'idObject') as number,
      type: attr(n, 'type') as string,
      reverse: attr(n, 'reverse') === 1 || attr(n, 'reverse') === true,
    }));

    const hasSA =
      attr(p, 'seamAllowance') === 1 ||
      attr(p, 'seamAllowance') === true ||
      attr(p, 'supplement') === 1 ||
      attr(p, 'supplement') === true;

    pieces.push({
      name: (attr(p, 'name') as string) ?? `piece_${attr(p, 'id')}`,
      closed: attr(p, 'closed') === 1 || attr(p, 'closed') === true,
      seamAllowance: hasSA ? 1 : 0,
      width: (attr(p, 'width') as number) ?? 0,
      nodes,
    });
  }

  return pieces;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Seamly2D XML file (.sm2d or .val) into a SeamlyPattern object.
 *
 * @param xmlContent - The XML content as a string
 * @returns Parsed SeamlyPattern
 * @throws Error if XML is invalid or missing required elements
 */
export function parseSeamlyXML(xmlContent: string): SeamlyPattern {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xmlContent);
  } catch {
    throw new Error('Invalid XML: failed to parse Seamly2D file');
  }

  const pattern = doc.pattern as Record<string, unknown>;
  if (!pattern) {
    throw new Error('Invalid Seamly2D file: missing <pattern> root element');
  }

  const unit = (pattern.unit as string) ?? 'cm';

  // Variables / increments
  const variables: Record<string, { formula: string; description: string }> = {};
  const increments = pattern.increments as Record<string, unknown>;
  if (increments) {
    for (const inc of ensureArray(increments.increment)) {
      const name = attr(inc, 'name') as string;
      if (name) {
        variables[name] = {
          formula: String(attr(inc, 'formula') ?? ''),
          description: String(attr(inc, 'description') ?? ''),
        };
      }
    }
  }

  // Blocks (draftBlock or draw)
  const blocks = [...ensureArray(pattern.draftBlock), ...ensureArray(pattern.draw)];

  const construction: SeamlyConstructionStep[] = [];
  const pieces: SeamlyPiece[] = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const blockObj = block as Record<string, unknown>;
    const blockName = (attr(block, 'name') as string) ?? 'default';

    // Construction steps
    const calc = blockObj.calculation;
    if (calc) {
      construction.push(...extractConstruction(calc, blockName));
    }

    // Pieces
    const pNode = blockObj.pieces ?? blockObj.details;
    if (pNode) {
      pieces.push(...extractPieces(pNode));
    }
  }

  return {
    name: 'pattern',
    unit,
    measurements: { required: [], defaults: {} },
    variables,
    construction,
    pieces,
  };
}
