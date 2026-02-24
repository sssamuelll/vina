#!/usr/bin/env tsx
/**
 * Seamly2D (.sm2d) → OpenClo JSON converter
 *
 * Usage: tsx converter.ts <pattern.sm2d> [output-dir]
 */

import { XMLParser } from "fast-xml-parser";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { basename, dirname, join, resolve } from "path";

// ---------------------------------------------------------------------------
// XML parser config – preserve attributes
// ---------------------------------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  isArray: (name) =>
    [
      "increment",
      "point",
      "line",
      "spline",
      "arc",
      "pathPoint",
      "piece",
      "detail",
      "node",
      "m",
      "draftBlock",
      "draw",
    ].includes(name),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SeamlyPattern {
  name: string;
  source: "Seamly2D";
  unit: string;
  measurements: {
    required: string[];
    defaults: Record<string, number>;
  };
  variables: Record<string, { formula: string; description: string }>;
  construction: ConstructionStep[];
  pieces: Piece[];
}

interface ConstructionStep {
  id: number;
  name: string;
  type: string;
  block?: string;
  [key: string]: unknown;
}

interface Piece {
  name: string;
  closed: boolean;
  seamAllowance: number;
  width: number;
  nodes: { id: number; type: string; reverse?: boolean }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function attr(el: any, name: string): any {
  return el?.[`@_${name}`];
}

// ---------------------------------------------------------------------------
// Parse .smis measurements file
// ---------------------------------------------------------------------------
function parseMeasurements(
  path: string
): { required: string[]; defaults: Record<string, number> } {
  const result: { required: string[]; defaults: Record<string, number> } = {
    required: [],
    defaults: {},
  };
  if (!existsSync(path)) {
    console.warn(`  ⚠ Measurements file not found: ${path}`);
    return result;
  }
  const xml = readFileSync(path, "utf-8");
  const doc = parser.parse(xml);
  const bm = doc?.smis?.["body-measurements"];
  if (!bm) return result;

  for (const m of ensureArray(bm.m)) {
    const name = attr(m, "name") as string;
    if (!name) continue;
    // skip computed custom measurements (@M_*)
    if (name.startsWith("@M_")) continue;
    const val = attr(m, "value");
    const numVal = typeof val === "number" ? val : parseFloat(String(val).trim());
    result.required.push(name);
    if (!isNaN(numVal) && numVal !== 0) {
      result.defaults[name] = numVal;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extract construction steps from a block's <calculation>
// ---------------------------------------------------------------------------
function extractConstruction(
  calc: any,
  blockName: string
): ConstructionStep[] {
  const steps: ConstructionStep[] = [];

  // points
  for (const p of ensureArray(calc?.point)) {
    const type = attr(p, "type") as string;
    const step: ConstructionStep = {
      id: attr(p, "id"),
      name: attr(p, "name") ?? "",
      type,
      block: blockName,
    };

    switch (type) {
      case "single":
        step.x = attr(p, "x");
        step.y = attr(p, "y");
        break;
      case "endLine":
        step.basePoint = attr(p, "basePoint");
        step.angle = attr(p, "angle");
        step.length = attr(p, "length");
        break;
      case "alongLine":
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        step.length = attr(p, "length");
        break;
      case "normal":
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        step.angle = attr(p, "angle");
        step.length = attr(p, "length");
        break;
      case "pointOfIntersection":
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        break;
      case "lineIntersectAxis":
        step.basePoint = attr(p, "basePoint");
        step.angle = attr(p, "angle");
        step.p1Line = attr(p, "p1Line");
        step.p2Line = attr(p, "p2Line");
        break;
      case "curveIntersectAxis":
        step.basePoint = attr(p, "basePoint");
        step.angle = attr(p, "angle");
        step.curve = attr(p, "curve");
        break;
      case "shoulder":
        step.p1Line = attr(p, "p1Line");
        step.p2Line = attr(p, "p2Line");
        step.pShoulder = attr(p, "pShoulder");
        step.length = attr(p, "length");
        break;
      case "height":
        step.basePoint = attr(p, "basePoint");
        step.p1Line = attr(p, "p1Line");
        step.p2Line = attr(p, "p2Line");
        break;
      case "cutSpline":
        step.spline = attr(p, "spline");
        step.length = attr(p, "length");
        break;
      case "cutSplinePath":
        step.splinePath = attr(p, "splinePath");
        step.length = attr(p, "length");
        break;
      case "cutArc":
        step.arc = attr(p, "arc");
        step.length = attr(p, "length");
        break;
      case "pointOfContact":
        step.center = attr(p, "center");
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        step.radius = attr(p, "radius");
        break;
      case "bisector":
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        step.thirdPoint = attr(p, "thirdPoint");
        step.length = attr(p, "length");
        break;
      case "lineIntersect":
        step.p1Line1 = attr(p, "p1Line1");
        step.p2Line1 = attr(p, "p2Line1");
        step.p1Line2 = attr(p, "p1Line2");
        step.p2Line2 = attr(p, "p2Line2");
        break;
      case "pointFromCircleAndTangent":
        step.center = attr(p, "cCenter");
        step.radius = attr(p, "cRadius");
        step.tangent = attr(p, "tangent");
        step.crossPoint = attr(p, "crossPoint");
        break;
      case "pointFromArcAndTangent":
        step.arc = attr(p, "arc");
        step.tangent = attr(p, "tangent");
        step.crossPoint = attr(p, "crossPoint");
        break;
      case "triangle":
        step.axisP1 = attr(p, "axisP1");
        step.axisP2 = attr(p, "axisP2");
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        break;
      case "intersectXY":
        step.firstPoint = attr(p, "firstPoint");
        step.secondPoint = attr(p, "secondPoint");
        break;
      case "pointOfIntersectionCircles":
        step.c1Center = attr(p, "c1Center");
        step.c2Center = attr(p, "c2Center");
        step.c1Radius = attr(p, "c1Radius");
        step.c2Radius = attr(p, "c2Radius");
        step.crossPoint = attr(p, "crossPoint");
        break;
      case "pointOfIntersectionArcs":
        step.firstArc = attr(p, "firstArc");
        step.secondArc = attr(p, "secondArc");
        step.crossPoint = attr(p, "crossPoint");
        break;
      case "trueDarts":
        step.p1Line = attr(p, "p1Line");
        step.p2Line = attr(p, "p2Line");
        step.d1 = attr(p, "dartP1");
        step.d2 = attr(p, "dartP2");
        step.d3 = attr(p, "dartP3");
        break;
      default:
        console.warn(`  ⚠ Unknown point type: "${type}" (id=${attr(p, "id")})`);
        // capture all attributes anyway
        for (const k of Object.keys(p)) {
          if (k.startsWith("@_") && !["id", "name", "type", "mx", "my"].includes(k.slice(2))) {
            step[k.slice(2)] = p[k];
          }
        }
    }
    steps.push(step);
  }

  // lines
  for (const l of ensureArray(calc?.line)) {
    steps.push({
      id: attr(l, "id"),
      name: "",
      type: "line",
      block: blockName,
      firstPoint: attr(l, "firstPoint"),
      secondPoint: attr(l, "secondPoint"),
      lineColor: attr(l, "lineColor"),
      lineType: attr(l, "lineType"),
    });
  }

  // splines
  for (const s of ensureArray(calc?.spline)) {
    const sType = attr(s, "type") as string;
    if (sType === "simpleInteractive" || sType === "simple") {
      steps.push({
        id: attr(s, "id"),
        name: "",
        type: "spline",
        block: blockName,
        point1: attr(s, "point1"),
        point4: attr(s, "point4"),
        angle1: attr(s, "angle1"),
        angle2: attr(s, "angle2"),
        length1: attr(s, "length1"),
        length2: attr(s, "length2"),
        // Old format fields
        kAsm1: attr(s, "kAsm1"),
        kAsm2: attr(s, "kAsm2"),
        kCurve: attr(s, "kCurve"),
      });
    } else if (sType === "pathInteractive" || sType === "path") {
      const pathPoints = ensureArray(s.pathPoint).map((pp: any) => ({
        point: attr(pp, "pSpline"),
        // New format
        angle1: attr(pp, "angle1"),
        angle2: attr(pp, "angle2"),
        length1: attr(pp, "length1"),
        length2: attr(pp, "length2"),
        // Old format
        angle: attr(pp, "angle"),
        kAsm1: attr(pp, "kAsm1"),
        kAsm2: attr(pp, "kAsm2"),
      }));
      const step: any = {
        id: attr(s, "id"),
        name: "",
        type: "splinePath",
        block: blockName,
        pathPoints,
      };
      // Old format kCurve on parent element
      const kCurve = attr(s, "kCurve");
      if (kCurve != null) step.kCurve = kCurve;
      steps.push(step);
    } else if (sType === "cubicBezier") {
      steps.push({
        id: attr(s, "id"),
        name: "",
        type: "cubicBezier",
        block: blockName,
        point1: attr(s, "point1"),
        point2: attr(s, "point2"),
        point3: attr(s, "point3"),
        point4: attr(s, "point4"),
      });
    } else if (sType === "cubicBezierPath") {
      const pathPoints = ensureArray(s.pathPoint).map((pp: any) => ({
        point: attr(pp, "pSpline"),
      }));
      steps.push({
        id: attr(s, "id"),
        name: "",
        type: "cubicBezierPath",
        block: blockName,
        pathPoints,
      });
    } else if (
      sType === "modelingSpline" ||
      sType === "modelingPath"
    ) {
      // skip modeling refs – they're in pieces
    } else {
      console.warn(`  ⚠ Unknown spline type: "${sType}" (id=${attr(s, "id")})`);
    }
  }

  // arcs
  for (const a of ensureArray(calc?.arc)) {
    const aType = attr(a, "type") as string;
    const step: ConstructionStep = {
      id: attr(a, "id"),
      name: "",
      type: `arc_${aType}`,
      block: blockName,
      center: attr(a, "center"),
    };
    if (aType === "simple") {
      step.radius = attr(a, "radius");
      step.angle1 = attr(a, "angle1");
      step.angle2 = attr(a, "angle2");
    } else if (aType === "arcWithLength") {
      step.radius = attr(a, "radius");
      step.angle1 = attr(a, "angle1");
      step.length = attr(a, "length");
    } else {
      console.warn(`  ⚠ Unknown arc type: "${aType}" (id=${attr(a, "id")})`);
    }
    steps.push(step);
  }

  // operations (rotation, flippingByLine, flippingByAxis, moving)
  for (const op of ensureArray(calc?.operation)) {
    const opType = attr(op, "type") as string;
    const sourceItems = ensureArray(op.source?.item).map((it: any) => attr(it, "idObject"));
    const destItems = ensureArray(op.destination?.item).map((it: any) => attr(it, "idObject"));

    // Each destination item is a new point/curve generated by the transform
    // We emit one step per source→dest pair
    for (let i = 0; i < Math.min(sourceItems.length, destItems.length); i++) {
      const step: ConstructionStep = {
        id: destItems[i],
        name: `${attr(op, "suffix") ?? ''}`,
        type: `op_${opType}`,
        block: blockName,
        sourceId: sourceItems[i],
      };
      if (opType === "rotation") {
        step.center = attr(op, "center");
        step.angle = attr(op, "angle");
      } else if (opType === "flippingByLine") {
        step.p1Line = attr(op, "p1Line");
        step.p2Line = attr(op, "p2Line");
      } else if (opType === "flippingByAxis") {
        step.axisType = attr(op, "axisType"); // vertical or horizontal
        step.center = attr(op, "center");
      } else if (opType === "moving") {
        step.angle = attr(op, "angle");
        step.length = attr(op, "length");
      }
      steps.push(step);
    }
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Parse <modeling> section — maps modeling IDs to construction IDs
// ---------------------------------------------------------------------------
interface ModelingEntry {
  id: number;
  constructionId: number;
  type: 'point' | 'spline' | 'splinePath' | 'arc' | 'unknown';
}

function parseModeling(modelingNode: any): Map<number, ModelingEntry> {
  const map = new Map<number, ModelingEntry>();
  if (!modelingNode) return map;

  // Points
  for (const p of ensureArray(modelingNode.point)) {
    const id = attr(p, "id");
    const idObject = attr(p, "idObject");
    if (id !== undefined && idObject !== undefined) {
      map.set(id, { id, constructionId: idObject, type: 'point' });
    }
  }

  // Splines
  for (const s of ensureArray(modelingNode.spline)) {
    const id = attr(s, "id");
    const idObject = attr(s, "idObject");
    const sType = attr(s, "type") as string;
    if (id !== undefined && idObject !== undefined) {
      const type = sType?.includes("Path") ? 'splinePath' : 'spline';
      map.set(id, { id, constructionId: idObject, type });
    }
  }

  // Arcs
  for (const a of ensureArray(modelingNode.arc)) {
    const id = attr(a, "id");
    const idObject = attr(a, "idObject");
    if (id !== undefined && idObject !== undefined) {
      map.set(id, { id, constructionId: idObject, type: 'arc' });
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Extract pieces from <pieces> — resolves modeling IDs to construction IDs
// ---------------------------------------------------------------------------
function extractPieces(piecesNode: any, modelingMap: Map<number, ModelingEntry>): Piece[] {
  if (!piecesNode) return [];
  const pieces: Piece[] = [];

  // Support both new format (<piece>) and old format (<detail>)
  const rawPieces = [
    ...ensureArray(piecesNode.piece),
    ...ensureArray(piecesNode.detail),
  ];

  for (const p of rawPieces) {
    // Nodes can be under <nodes><node> (new) or directly <node> (old detail format)
    const nodeList = p?.nodes?.node ?? p?.node;
    const nodes = ensureArray(nodeList).map((n: any) => {
      const modelingId = attr(n, "idObject") as number;
      const nodeType = attr(n, "type") as string;

      // Resolve modeling ID → construction ID
      const modeling = modelingMap.get(modelingId);
      const constructionId = modeling?.constructionId ?? modelingId;

      const entry: any = {
        id: constructionId,
        modelingId: modelingId !== constructionId ? modelingId : undefined,
        type: nodeType,
        // Preserve modeling type info for curves
        curveType: modeling?.type === 'spline' || modeling?.type === 'splinePath' || modeling?.type === 'arc'
          ? modeling.type : undefined,
      };
      if (attr(n, "reverse") !== undefined) {
        entry.reverse = attr(n, "reverse") === 1 || attr(n, "reverse") === true;
      }
      return entry;
    });

    // "supplement" is old-format for seamAllowance, "seamAllowance" is new-format
    const hasSA = attr(p, "seamAllowance") === 1 || attr(p, "seamAllowance") === true
      || attr(p, "supplement") === 1 || attr(p, "supplement") === true;

    pieces.push({
      name: attr(p, "name") ?? `piece_${attr(p, "id")}`,
      closed: attr(p, "closed") === 1 || attr(p, "closed") === true,
      seamAllowance: hasSA ? 1 : 0,
      width: attr(p, "width") ?? 0,
      nodes,
    });
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------
function convert(sm2dPath: string, outputDir: string): void {
  const xml = readFileSync(sm2dPath, "utf-8");
  const doc = parser.parse(xml);
  const pattern = doc.pattern;
  if (!pattern) {
    console.error(`No <pattern> root in ${sm2dPath}`);
    return;
  }

  const patternName = basename(sm2dPath, ".sm2d");
  console.log(`Converting: ${patternName}`);

  // Unit
  const unit = pattern.unit ?? "cm";

  // Measurements
  const measPath = pattern.measurements;
  let measurements = { required: [] as string[], defaults: {} as Record<string, number> };
  if (measPath) {
    const absPath = resolve(dirname(sm2dPath), measPath);
    measurements = parseMeasurements(absPath);
  }

  // Variables / increments
  const variables: Record<string, { formula: string; description: string }> = {};
  for (const inc of ensureArray(pattern.increments?.increment)) {
    const name = attr(inc, "name") as string;
    if (!name) continue;
    variables[name] = {
      formula: String(attr(inc, "formula") ?? ""),
      description: String(attr(inc, "description") ?? "").replace(/&#10;/g, "\n"),
    };
  }

  // Blocks (draftBlock or draw)
  const blocks = [
    ...ensureArray(pattern.draftBlock),
    ...ensureArray(pattern.draw),
  ];

  const construction: ConstructionStep[] = [];
  const pieces: Piece[] = [];

  for (const block of blocks) {
    const blockName = attr(block, "name") ?? "default";
    const calc = block.calculation;
    if (calc) {
      construction.push(...extractConstruction(calc, blockName));
    }
    // Parse modeling section (maps modeling IDs → construction IDs)
    const modelingMap = parseModeling(block.modeling);
    // pieces can be under <pieces> or <details>
    const pNode = block.pieces ?? block.details;
    if (pNode) {
      pieces.push(...extractPieces(pNode, modelingMap));
    }
  }

  const output: SeamlyPattern = {
    name: patternName,
    source: "Seamly2D",
    unit,
    measurements,
    variables,
    construction,
    pieces,
  };

  const outPath = join(outputDir, `${patternName}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(
    `  ✓ ${construction.length} construction steps, ${pieces.length} pieces → ${outPath}`
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: tsx converter.ts <pattern.sm2d> [output-dir]");
  process.exit(1);
}
const inputFile = args[0];
const outputDir = args[1] ?? join(dirname(new URL(import.meta.url).pathname), "output");

convert(inputFile, outputDir);
