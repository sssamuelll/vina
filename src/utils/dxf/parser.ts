/**
 * DXF ASCII Parser — supports R12 and R2000+ files.
 * Parses into DXFDocument for conversion to PatternPiece[].
 */
import {
  DXFDocument, DXFEntity, DXFEntityType, DXFLayer, DXFBlock,
  DXFLineData, DXFLWPolylineData, DXFSplineData, DXFArcData,
  DXFCircleData, DXFTextData, DXFInsertData, DXFPolylineData,
} from './types';

// ─── Group Code Pair ───

interface GroupPair {
  code: number;
  value: string;
}

function parseGroupPairs(lines: string[]): GroupPair[] {
  const pairs: GroupPair[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1]?.trim() ?? '';
    if (!isNaN(code)) {
      pairs.push({ code, value });
    }
  }
  return pairs;
}

// ─── Section Splitting ───

interface DXFSections {
  header: GroupPair[];
  tables: GroupPair[];
  blocks: GroupPair[];
  entities: GroupPair[];
}

function splitSections(pairs: GroupPair[]): DXFSections {
  const sections: DXFSections = { header: [], tables: [], blocks: [], entities: [] };
  let current: GroupPair[] | null = null;

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.code === 0 && p.value === 'SECTION') {
      const next = pairs[i + 1];
      if (next?.code === 2) {
        const name = next.value.toUpperCase();
        if (name === 'HEADER') current = sections.header;
        else if (name === 'TABLES') current = sections.tables;
        else if (name === 'BLOCKS') current = sections.blocks;
        else if (name === 'ENTITIES') current = sections.entities;
        else current = [];
        i++; // skip the name pair
        continue;
      }
    }
    if (p.code === 0 && p.value === 'ENDSEC') {
      current = null;
      continue;
    }
    if (current) current.push(p);
  }
  return sections;
}

// ─── Parse Header ───

function parseHeader(pairs: GroupPair[]): Map<string, string | number> {
  const header = new Map<string, string | number>();
  let currentVar = '';
  for (const p of pairs) {
    if (p.code === 9) {
      currentVar = p.value;
    } else if (currentVar) {
      header.set(currentVar, p.code >= 70 && p.code < 80 ? parseInt(p.value, 10) : p.value);
      currentVar = '';
    }
  }
  return header;
}

// ─── Parse Layers ───

function parseLayers(pairs: GroupPair[]): DXFLayer[] {
  const layers: DXFLayer[] = [];
  let inLayerTable = false;
  let current: Partial<DXFLayer> | null = null;

  for (const p of pairs) {
    if (p.code === 0 && p.value === 'TABLE') continue;
    if (p.code === 2 && p.value === 'LAYER') { inLayerTable = true; continue; }
    if (p.code === 0 && p.value === 'ENDTAB') { inLayerTable = false; if (current?.name) layers.push(current as DXFLayer); current = null; continue; }
    if (!inLayerTable) continue;
    if (p.code === 0 && p.value === 'LAYER') {
      if (current?.name) layers.push(current as DXFLayer);
      current = { name: '', color: 7, lineType: 'CONTINUOUS' };
      continue;
    }
    if (!current) continue;
    if (p.code === 2) current.name = p.value;
    if (p.code === 62) current.color = parseInt(p.value, 10);
    if (p.code === 6) current.lineType = p.value;
  }
  if (current?.name) layers.push(current as DXFLayer);
  return layers;
}

// ─── Parse Entities ───

function parseEntityList(pairs: GroupPair[]): DXFEntity[] {
  const entities: DXFEntity[] = [];
  let i = 0;

  while (i < pairs.length) {
    if (pairs[i].code !== 0) { i++; continue; }
    const entityType = pairs[i].value as DXFEntityType;
    i++;
    // Collect all pairs until next code-0
    const entityPairs: GroupPair[] = [];
    while (i < pairs.length && pairs[i].code !== 0) {
      entityPairs.push(pairs[i]);
      i++;
    }

    const layer = entityPairs.find(p => p.code === 8)?.value ?? '0';

    switch (entityType) {
      case 'LINE': {
        const d: DXFLineData = {
          x1: num(entityPairs, 10), y1: num(entityPairs, 20),
          x2: num(entityPairs, 11), y2: num(entityPairs, 21),
        };
        entities.push({ type: 'LINE', layer, data: d });
        break;
      }
      case 'LWPOLYLINE': {
        const closed = (int(entityPairs, 70) & 1) === 1;
        const count = int(entityPairs, 90);
        const vertices: { x: number; y: number; bulge: number }[] = [];
        let vx = 0, vy = 0, vb = 0;
        let hasX = false;
        for (const p of entityPairs) {
          if (p.code === 10) { if (hasX) { vertices.push({ x: vx, y: vy, bulge: vb }); vb = 0; } vx = parseFloat(p.value); hasX = true; }
          else if (p.code === 20) { vy = parseFloat(p.value); }
          else if (p.code === 42) { vb = parseFloat(p.value); }
        }
        if (hasX) vertices.push({ x: vx, y: vy, bulge: vb });
        entities.push({ type: 'LWPOLYLINE', layer, data: { closed, vertices } as DXFLWPolylineData });
        break;
      }
      case 'POLYLINE': {
        const closed = (int(entityPairs, 70) & 1) === 1;
        // Vertices come as separate VERTEX entities until SEQEND
        const vertices: { x: number; y: number; bulge: number }[] = [];
        while (i < pairs.length) {
          if (pairs[i].code === 0 && pairs[i].value === 'SEQEND') { i++; while (i < pairs.length && pairs[i].code !== 0) i++; break; }
          if (pairs[i].code === 0 && pairs[i].value === 'VERTEX') {
            i++;
            let vx = 0, vy = 0, vb = 0;
            while (i < pairs.length && pairs[i].code !== 0) {
              if (pairs[i].code === 10) vx = parseFloat(pairs[i].value);
              else if (pairs[i].code === 20) vy = parseFloat(pairs[i].value);
              else if (pairs[i].code === 42) vb = parseFloat(pairs[i].value);
              i++;
            }
            vertices.push({ x: vx, y: vy, bulge: vb });
          } else {
            break;
          }
        }
        entities.push({ type: 'POLYLINE', layer, data: { closed, vertices } as DXFPolylineData });
        break;
      }
      case 'SPLINE': {
        const degree = int(entityPairs, 71) || 3;
        const closed = (int(entityPairs, 70) & 1) === 1;
        const knots: number[] = [];
        const controlPoints: { x: number; y: number }[] = [];
        const fitPoints: { x: number; y: number }[] = [];
        let cpX: number | null = null;
        let fpX: number | null = null;
        for (const p of entityPairs) {
          if (p.code === 40) knots.push(parseFloat(p.value));
          else if (p.code === 10) {
            if (cpX !== null) controlPoints.push({ x: cpX, y: 0 });
            cpX = parseFloat(p.value);
          }
          else if (p.code === 20 && cpX !== null) {
            controlPoints.push({ x: cpX, y: parseFloat(p.value) });
            cpX = null;
          }
          else if (p.code === 11) {
            if (fpX !== null) fitPoints.push({ x: fpX, y: 0 });
            fpX = parseFloat(p.value);
          }
          else if (p.code === 21 && fpX !== null) {
            fitPoints.push({ x: fpX, y: parseFloat(p.value) });
            fpX = null;
          }
        }
        entities.push({ type: 'SPLINE', layer, data: { degree, closed, knots, controlPoints, fitPoints } as DXFSplineData });
        break;
      }
      case 'ARC': {
        const d: DXFArcData = {
          cx: num(entityPairs, 10), cy: num(entityPairs, 20),
          radius: num(entityPairs, 40),
          startAngle: num(entityPairs, 50),
          endAngle: num(entityPairs, 51),
        };
        entities.push({ type: 'ARC', layer, data: d });
        break;
      }
      case 'CIRCLE': {
        const d: DXFCircleData = {
          cx: num(entityPairs, 10), cy: num(entityPairs, 20),
          radius: num(entityPairs, 40),
        };
        entities.push({ type: 'CIRCLE', layer, data: d });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const d: DXFTextData = {
          text: entityPairs.find(p => p.code === 1)?.value ?? '',
          x: num(entityPairs, 10), y: num(entityPairs, 20),
          height: num(entityPairs, 40),
        };
        entities.push({ type: entityType, layer, data: d });
        break;
      }
      case 'INSERT': {
        const d: DXFInsertData = {
          blockName: entityPairs.find(p => p.code === 2)?.value ?? '',
          x: num(entityPairs, 10), y: num(entityPairs, 20),
          scaleX: numOr(entityPairs, 41, 1),
          scaleY: numOr(entityPairs, 42, 1),
          rotation: numOr(entityPairs, 50, 0),
        };
        entities.push({ type: 'INSERT', layer, data: d });
        break;
      }
    }
  }
  return entities;
}

// ─── Parse Blocks ───

function parseBlocks(pairs: GroupPair[]): Map<string, DXFBlock> {
  const blocks = new Map<string, DXFBlock>();
  let i = 0;

  while (i < pairs.length) {
    if (pairs[i].code === 0 && pairs[i].value === 'BLOCK') {
      i++;
      let name = '';
      let bx = 0, by = 0;
      const blockPairs: GroupPair[] = [];
      // Read block header
      while (i < pairs.length && !(pairs[i].code === 0)) {
        if (pairs[i].code === 2) name = pairs[i].value;
        if (pairs[i].code === 10) bx = parseFloat(pairs[i].value);
        if (pairs[i].code === 20) by = parseFloat(pairs[i].value);
        i++;
      }
      // Read block entities until ENDBLK
      while (i < pairs.length && !(pairs[i].code === 0 && pairs[i].value === 'ENDBLK')) {
        blockPairs.push(pairs[i]);
        i++;
      }
      if (name && !name.startsWith('*')) {
        const entities = parseEntityList(blockPairs);
        blocks.set(name, { name, basePoint: { x: bx, y: by }, entities });
      }
    } else {
      i++;
    }
  }
  return blocks;
}

// ─── Helpers ───

function num(pairs: GroupPair[], code: number): number {
  const p = pairs.find(p => p.code === code);
  return p ? parseFloat(p.value) : 0;
}

function numOr(pairs: GroupPair[], code: number, def: number): number {
  const p = pairs.find(p => p.code === code);
  return p ? parseFloat(p.value) : def;
}

function int(pairs: GroupPair[], code: number): number {
  const p = pairs.find(p => p.code === code);
  return p ? parseInt(p.value, 10) : 0;
}

// ─── Main Parser ───

/**
 * Parse a DXF ASCII file into a structured {@link DXFDocument}.
 *
 * Supports R12 and R2000+ formats. Extracts header variables, layer definitions,
 * block definitions, and entities (LINE, LWPOLYLINE, POLYLINE, SPLINE, ARC,
 * CIRCLE, TEXT/MTEXT, INSERT).
 *
 * @param content - Raw DXF file content as a string
 * @returns Parsed document with header, layers, blocks, and entities
 *
 * @example
 * ```ts
 * const doc = parseDXF(dxfString);
 * console.log(doc.layers.map(l => l.name));
 * ```
 */
export function parseDXF(content: string): DXFDocument {
  const lines = content.split(/\r?\n/);
  const pairs = parseGroupPairs(lines);
  const sections = splitSections(pairs);

  return {
    header: parseHeader(sections.header),
    layers: parseLayers(sections.tables),
    blocks: parseBlocks(sections.blocks),
    entities: parseEntityList(sections.entities),
  };
}
