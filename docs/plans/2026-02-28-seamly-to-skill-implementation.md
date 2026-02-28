# Seamly2D to .oskill Converter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable browser-based import of Seamly2D .sm2d files, converting them to CommunitySkill format with natural language instructions for the Copilot.

**Architecture:** Core converter in `seamlyToSkill.ts` parses XML, generates metadata/triggers, and converts geometric steps to instructional text. UI in `ImportSeamlyModal.tsx` handles file upload and metadata editing.

**Tech Stack:** TypeScript, fast-xml-parser (browser-compatible), React, SkillRegistry

---

## Task 1: Create XML Parser Module

**Files:**
- Create: `src/copilot/skills/seamlyParser.ts`
- Test: `src/copilot/skills/__tests__/seamlyParser.test.ts`

### Step 1: Write the failing test

```typescript
// src/copilot/skills/__tests__/seamlyParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSeamlyXML } from '../seamlyParser';

const MINIMAL_SM2D = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <version>0.6.0</version>
  <unit>cm</unit>
  <draftBlock name="TestBlock">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="endLine" basePoint="1" angle="90" length="10" />
    </calculation>
  </draftBlock>
</pattern>`;

describe('parseSeamlyXML', () => {
  it('parses minimal .sm2d pattern', () => {
    const result = parseSeamlyXML(MINIMAL_SM2D);

    expect(result.name).toBe('pattern');
    expect(result.unit).toBe('cm');
    expect(result.construction).toHaveLength(2);
    expect(result.construction[0]).toMatchObject({
      id: 1,
      name: 'A',
      type: 'single',
      x: 0,
      y: 0,
    });
  });

  it('throws on invalid XML', () => {
    expect(() => parseSeamlyXML('not xml')).toThrow();
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/seamlyParser.test.ts`
Expected: FAIL with "Cannot find module '../seamlyParser'"

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/seamlyParser.ts
/**
 * Seamly2D XML Parser — browser-compatible parser for .sm2d files.
 */
import { XMLParser } from 'fast-xml-parser';

export interface SeamlyConstructionStep {
  id: number;
  name: string;
  type: string;
  block?: string;
  [key: string]: unknown;
}

export interface SeamlyPiece {
  name: string;
  closed: boolean;
  seamAllowance: number;
  width: number;
  nodes: { id: number; type: string; reverse?: boolean }[];
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

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  isArray: (name) =>
    ['increment', 'point', 'line', 'spline', 'arc', 'pathPoint', 'piece', 'detail', 'node', 'm', 'draftBlock', 'draw'].includes(name),
});

function ensureArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function attr(el: unknown, name: string): unknown {
  return (el as Record<string, unknown>)?.[`@_${name}`];
}

function extractConstruction(calc: unknown, blockName: string): SeamlyConstructionStep[] {
  const steps: SeamlyConstructionStep[] = [];
  const calcObj = calc as Record<string, unknown>;

  for (const p of ensureArray(calcObj?.point)) {
    const step: SeamlyConstructionStep = {
      id: attr(p, 'id') as number,
      name: (attr(p, 'name') as string) ?? '',
      type: attr(p, 'type') as string,
      block: blockName,
    };

    // Copy all relevant attributes
    const pObj = p as Record<string, unknown>;
    for (const key of Object.keys(pObj)) {
      if (key.startsWith('@_') && !['id', 'name', 'type', 'mx', 'my'].includes(key.slice(2))) {
        step[key.slice(2)] = pObj[key];
      }
    }
    steps.push(step);
  }

  for (const l of ensureArray(calcObj?.line)) {
    steps.push({
      id: attr(l, 'id') as number,
      name: '',
      type: 'line',
      block: blockName,
      firstPoint: attr(l, 'firstPoint'),
      secondPoint: attr(l, 'secondPoint'),
    });
  }

  for (const s of ensureArray(calcObj?.spline)) {
    const sType = attr(s, 'type') as string;
    steps.push({
      id: attr(s, 'id') as number,
      name: '',
      type: sType === 'pathInteractive' || sType === 'path' ? 'splinePath' : 'spline',
      block: blockName,
      point1: attr(s, 'point1'),
      point4: attr(s, 'point4'),
      angle1: attr(s, 'angle1'),
      angle2: attr(s, 'angle2'),
      length1: attr(s, 'length1'),
      length2: attr(s, 'length2'),
    });
  }

  for (const a of ensureArray(calcObj?.arc)) {
    steps.push({
      id: attr(a, 'id') as number,
      name: '',
      type: `arc_${attr(a, 'type')}`,
      block: blockName,
      center: attr(a, 'center'),
      radius: attr(a, 'radius'),
      angle1: attr(a, 'angle1'),
      angle2: attr(a, 'angle2'),
    });
  }

  return steps;
}

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
  for (const inc of ensureArray(increments?.increment)) {
    const name = attr(inc, 'name') as string;
    if (name) {
      variables[name] = {
        formula: String(attr(inc, 'formula') ?? ''),
        description: String(attr(inc, 'description') ?? ''),
      };
    }
  }

  // Blocks
  const blocks = [
    ...ensureArray(pattern.draftBlock),
    ...ensureArray(pattern.draw),
  ];

  const construction: SeamlyConstructionStep[] = [];
  const pieces: SeamlyPiece[] = [];

  for (const block of blocks) {
    const blockObj = block as Record<string, unknown>;
    const blockName = (attr(block, 'name') as string) ?? 'default';
    const calc = blockObj.calculation;
    if (calc) {
      construction.push(...extractConstruction(calc, blockName));
    }

    // Pieces
    const piecesNode = blockObj.pieces ?? blockObj.details;
    if (piecesNode) {
      const piecesObj = piecesNode as Record<string, unknown>;
      const rawPieces = [...ensureArray(piecesObj.piece), ...ensureArray(piecesObj.detail)];
      for (const p of rawPieces) {
        const nodeList = (p as Record<string, unknown>)?.nodes?.node ?? (p as Record<string, unknown>)?.node;
        const nodes = ensureArray(nodeList).map((n: unknown) => ({
          id: attr(n, 'idObject') as number,
          type: attr(n, 'type') as string,
          reverse: attr(n, 'reverse') === 1 || attr(n, 'reverse') === true,
        }));

        pieces.push({
          name: (attr(p, 'name') as string) ?? `piece_${attr(p, 'id')}`,
          closed: attr(p, 'closed') === 1 || attr(p, 'closed') === true,
          seamAllowance: attr(p, 'seamAllowance') === 1 || attr(p, 'supplement') === 1 ? 1 : 0,
          width: (attr(p, 'width') as number) ?? 0,
          nodes,
        });
      }
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
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/seamlyParser.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/copilot/skills/seamlyParser.ts src/copilot/skills/__tests__/seamlyParser.test.ts
git commit -m "feat(skills): add Seamly2D XML parser for browser"
```

---

## Task 2: Create Instruction Generator

**Files:**
- Create: `src/copilot/skills/instructionGenerator.ts`
- Test: `src/copilot/skills/__tests__/instructionGenerator.test.ts`

### Step 1: Write the failing test

```typescript
// src/copilot/skills/__tests__/instructionGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { generateInstruction, getToolCalls } from '../instructionGenerator';

describe('generateInstruction', () => {
  it('generates instruction for single point', () => {
    const step = { id: 1, name: 'A', type: 'single', x: 0, y: 0 };
    expect(generateInstruction(step)).toBe('Mark point A at coordinates (0, 0)');
  });

  it('generates instruction for endLine', () => {
    const step = { id: 2, name: 'B', type: 'endLine', basePoint: 1, angle: 90, length: 'chest/4' };
    expect(generateInstruction(step)).toContain('From point 1');
    expect(generateInstruction(step)).toContain('90°');
    expect(generateInstruction(step)).toContain('chest/4');
  });

  it('generates instruction for spline', () => {
    const step = { id: 3, name: '', type: 'spline', point1: 1, point4: 2, angle1: 45, angle2: 135 };
    expect(generateInstruction(step)).toContain('curve');
    expect(generateInstruction(step)).toContain('1');
    expect(generateInstruction(step)).toContain('2');
  });

  it('returns fallback for unknown type', () => {
    const step = { id: 99, name: 'X', type: 'unknownType' };
    expect(generateInstruction(step)).toContain('unknownType');
  });
});

describe('getToolCalls', () => {
  it('returns createPoint for point types', () => {
    expect(getToolCalls('single')).toContain('createPoint');
    expect(getToolCalls('endLine')).toContain('createPoint');
  });

  it('returns createCurve for spline', () => {
    expect(getToolCalls('spline')).toContain('createCurve');
  });

  it('returns empty array for unknown', () => {
    expect(getToolCalls('unknownType')).toEqual([]);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/instructionGenerator.test.ts`
Expected: FAIL

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/instructionGenerator.ts
/**
 * Instruction Generator — converts Seamly2D geometric steps to natural language.
 */
import type { SeamlyConstructionStep } from './seamlyParser';

type StepTemplate = (step: SeamlyConstructionStep) => string;

const STEP_TEMPLATES: Record<string, StepTemplate> = {
  single: (s) => `Mark point ${s.name} at coordinates (${s.x}, ${s.y})`,

  endLine: (s) => `From point ${s.basePoint}, draw a line at ${s.angle}° with length ${s.length} to create point ${s.name}`,

  alongLine: (s) => `Along the line from ${s.firstPoint} to ${s.secondPoint}, measure ${s.length} to mark point ${s.name}`,

  normal: (s) => `From point ${s.firstPoint}, draw a perpendicular (${s.angle}°) line of length ${s.length} to create point ${s.name}`,

  pointOfIntersection: (s) => `Find the intersection point ${s.name} between horizontal from ${s.firstPoint} and vertical from ${s.secondPoint}`,

  lineIntersectAxis: (s) => `From point ${s.basePoint} at angle ${s.angle}°, find intersection with line ${s.p1Line}-${s.p2Line} to create point ${s.name}`,

  bisector: (s) => `Draw the angle bisector from ${s.firstPoint}-${s.secondPoint}-${s.thirdPoint} with length ${s.length} to create point ${s.name}`,

  shoulder: (s) => `From shoulder point ${s.pShoulder}, measure ${s.length} along line ${s.p1Line}-${s.p2Line} to create point ${s.name}`,

  height: (s) => `Drop a perpendicular from ${s.basePoint} to line ${s.p1Line}-${s.p2Line} to create point ${s.name}`,

  lineIntersect: (s) => `Find intersection of line ${s.p1Line1}-${s.p2Line1} and line ${s.p1Line2}-${s.p2Line2} to create point ${s.name}`,

  curveIntersectAxis: (s) => `From point ${s.basePoint} at angle ${s.angle}°, find intersection with curve ${s.curve} to create point ${s.name}`,

  cutSpline: (s) => `Along spline ${s.spline}, measure ${s.length} to create point ${s.name}`,

  cutArc: (s) => `Along arc ${s.arc}, measure ${s.length} to create point ${s.name}`,

  spline: (s) => `Draw a curve from point ${s.point1} to point ${s.point4} with angles ${s.angle1}° and ${s.angle2}°`,

  splinePath: (s) => `Draw a multi-segment curve path through the specified points`,

  cubicBezier: (s) => `Draw a cubic bezier curve from ${s.point1} through ${s.point2}, ${s.point3} to ${s.point4}`,

  line: (s) => `Draw a construction line from point ${s.firstPoint} to point ${s.secondPoint}`,

  arc_simple: (s) => `Draw an arc centered at ${s.center} with radius ${s.radius} from ${s.angle1}° to ${s.angle2}°`,

  arc_arcWithLength: (s) => `Draw an arc centered at ${s.center} with radius ${s.radius} starting at ${s.angle1}° with length ${s.length}`,

  op_rotation: (s) => `Rotate element ${s.sourceId} around point ${s.center} by ${s.angle}°`,

  op_flippingByLine: (s) => `Mirror element ${s.sourceId} across line ${s.p1Line}-${s.p2Line}`,

  op_flippingByAxis: (s) => `Mirror element ${s.sourceId} across ${s.axisType} axis at ${s.center}`,

  op_moving: (s) => `Move element ${s.sourceId} at angle ${s.angle}° by distance ${s.length}`,
};

const STEP_TOOLS: Record<string, string[]> = {
  single: ['createPoint'],
  endLine: ['createPoint'],
  alongLine: ['createPoint'],
  normal: ['createPoint'],
  pointOfIntersection: ['createPoint'],
  lineIntersectAxis: ['createPoint'],
  bisector: ['createPoint'],
  shoulder: ['createPoint'],
  height: ['createPoint'],
  lineIntersect: ['createPoint'],
  curveIntersectAxis: ['createPoint'],
  cutSpline: ['createPoint'],
  cutArc: ['createPoint'],
  spline: ['createCurve'],
  splinePath: ['createCurve'],
  cubicBezier: ['createCurve'],
  line: ['createLine'],
  arc_simple: ['createArc'],
  arc_arcWithLength: ['createArc'],
  op_rotation: ['transformPiece'],
  op_flippingByLine: ['transformPiece'],
  op_flippingByAxis: ['transformPiece'],
  op_moving: ['transformPiece'],
};

export function generateInstruction(step: SeamlyConstructionStep): string {
  const template = STEP_TEMPLATES[step.type];
  if (template) {
    return template(step);
  }
  return `Execute ${step.type} operation for point ${step.name || step.id}`;
}

export function getToolCalls(stepType: string): string[] {
  return STEP_TOOLS[stepType] ?? [];
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/instructionGenerator.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/copilot/skills/instructionGenerator.ts src/copilot/skills/__tests__/instructionGenerator.test.ts
git commit -m "feat(skills): add instruction generator for Seamly2D steps"
```

---

## Task 3: Create Main Converter (seamlyToSkill)

**Files:**
- Create: `src/copilot/skills/seamlyToSkill.ts`
- Test: `src/copilot/skills/__tests__/seamlyToSkill.test.ts`

### Step 1: Write the failing test

```typescript
// src/copilot/skills/__tests__/seamlyToSkill.test.ts
import { describe, it, expect } from 'vitest';
import { convertSeamlyToSkill, generateTriggers, inferTags } from '../seamlyToSkill';

const MINIMAL_SM2D = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <draftBlock name="bodice_block">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="endLine" basePoint="1" angle="90" length="10" />
    </calculation>
  </draftBlock>
</pattern>`;

describe('convertSeamlyToSkill', () => {
  it('converts .sm2d to CommunitySkill', () => {
    const result = convertSeamlyToSkill(MINIMAL_SM2D, 'bodice_block');

    expect(result.skill.schemaVersion).toBe('1.0.0');
    expect(result.skill.metadata.name).toBe('Bodice Block');
    expect(result.skill.metadata.id).toBe('local:bodice-block');
    expect(result.skill.skill.triggers).toContain('bodice block');
    expect(result.skill.skill.constructionSteps).toHaveLength(2);
    expect(result.skill.skill.constructionSteps[0].instruction).toContain('Mark point A');
  });

  it('returns validation stats', () => {
    const result = convertSeamlyToSkill(MINIMAL_SM2D, 'test');

    expect(result.validation.valid).toBe(true);
    expect(result.validation.stats.totalSteps).toBe(2);
    expect(result.validation.stats.convertedSteps).toBe(2);
  });
});

describe('generateTriggers', () => {
  it('generates bilingual triggers', () => {
    const triggers = generateTriggers('bodice_block');
    expect(triggers).toContain('bodice block');
    expect(triggers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('inferTags', () => {
  it('infers tags from name', () => {
    const tags = inferTags('basic_bodice_block');
    expect(tags).toContain('bodice');
    expect(tags).toContain('basic');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/seamlyToSkill.test.ts`
Expected: FAIL

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/seamlyToSkill.ts
/**
 * Seamly2D to Skill Converter — transforms .sm2d patterns into CommunitySkill format.
 */
import type { CommunitySkill, CommunitySkillMetadata } from './communityFormat';
import type { ConstructionStep, Formula, PatternSkill } from './types';
import { parseSeamlyXML, type SeamlyPattern } from './seamlyParser';
import { generateInstruction, getToolCalls } from './instructionGenerator';

export interface ImportValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    totalSteps: number;
    convertedSteps: number;
    pieces: number;
    measurements: string[];
  };
}

export interface ConversionResult {
  skill: CommunitySkill;
  validation: ImportValidation;
}

/** Slugify a string for use as ID */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Humanize a snake_case or kebab-case string */
function humanize(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Infer tags from pattern name */
export function inferTags(name: string): string[] {
  const words = name.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/);
  const knownTags = ['bodice', 'sleeve', 'skirt', 'pants', 'trousers', 'jacket', 'coat', 'shirt', 'blouse', 'dress', 'collar', 'cuff', 'basic', 'block', 'fitted', 'loose'];
  return words.filter((w) => knownTags.includes(w));
}

/** Generate bilingual triggers from pattern name */
export function generateTriggers(name: string): string[] {
  const base = name.toLowerCase().replace(/[-_]/g, ' ').trim();
  const triggers = [base];

  // Add variations
  const words = base.split(' ');
  if (words.length > 1) {
    triggers.push(words.reverse().join(' '));
  }

  // Spanish translations for common terms
  const translations: Record<string, string> = {
    'bodice': 'corpiño',
    'sleeve': 'manga',
    'skirt': 'falda',
    'pants': 'pantalón',
    'trousers': 'pantalón',
    'jacket': 'chaqueta',
    'coat': 'abrigo',
    'shirt': 'camisa',
    'blouse': 'blusa',
    'dress': 'vestido',
    'block': 'base',
    'basic': 'básico',
  };

  for (const [en, es] of Object.entries(translations)) {
    if (base.includes(en)) {
      triggers.push(base.replace(en, es));
    }
  }

  return [...new Set(triggers)];
}

/** Extract formulas from Seamly2D variables */
function extractFormulas(
  variables: Record<string, { formula: string; description: string }>,
): Record<string, Formula> {
  const formulas: Record<string, Formula> = {};

  for (const [name, def] of Object.entries(variables)) {
    const cleanName = name.replace(/^#/, '');
    formulas[cleanName] = {
      name: humanize(cleanName),
      expression: def.formula,
      description: def.description || `Variable ${cleanName}`,
      variables: [], // Would need to parse formula to extract
      unit: 'cm',
    };
  }

  return formulas;
}

/** Convert SeamlyPattern to CommunitySkill */
function convertPattern(
  pattern: SeamlyPattern,
  patternName: string,
): ConversionResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let convertedSteps = 0;

  // Generate metadata
  const metadata: CommunitySkillMetadata = {
    id: `local:${slugify(patternName)}`,
    name: humanize(patternName),
    version: '1.0.0',
    author: 'imported',
    description: `Pattern imported from Seamly2D: ${humanize(patternName)}`,
    tags: inferTags(patternName),
    license: 'MIT',
  };

  // Generate triggers
  const triggers = generateTriggers(patternName);

  // Convert construction steps
  const constructionSteps: ConstructionStep[] = [];
  for (let i = 0; i < pattern.construction.length; i++) {
    const step = pattern.construction[i];
    const instruction = generateInstruction(step);
    const toolCalls = getToolCalls(step.type);

    if (instruction.startsWith('Execute ')) {
      warnings.push(`Step ${i + 1}: Unknown type "${step.type}", using fallback instruction`);
    } else {
      convertedSteps++;
    }

    constructionSteps.push({
      order: i + 1,
      instruction,
      toolCalls,
    });
  }

  // Extract formulas
  const formulas = extractFormulas(pattern.variables);

  // Build skill
  const skill: PatternSkill = {
    name: metadata.name,
    triggers,
    description: metadata.description,
    methods: [
      {
        name: 'Seamly2D Import',
        origin: 'imported',
        description: `Imported from Seamly2D pattern file`,
        formulas: {},
      },
    ],
    formulas,
    easeTable: {},
    constructionSteps,
  };

  const communitySkill: CommunitySkill = {
    schemaVersion: '1.0.0',
    metadata,
    skill,
  };

  const validation: ImportValidation = {
    valid: errors.length === 0,
    warnings,
    errors,
    stats: {
      totalSteps: pattern.construction.length,
      convertedSteps,
      pieces: pattern.pieces.length,
      measurements: pattern.measurements.required,
    },
  };

  return { skill: communitySkill, validation };
}

/** Main entry point: convert .sm2d XML to CommunitySkill */
export function convertSeamlyToSkill(
  xmlContent: string,
  patternName: string,
): ConversionResult {
  const pattern = parseSeamlyXML(xmlContent);
  return convertPattern(pattern, patternName);
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/seamlyToSkill.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/copilot/skills/seamlyToSkill.ts src/copilot/skills/__tests__/seamlyToSkill.test.ts
git commit -m "feat(skills): add main Seamly2D to skill converter"
```

---

## Task 4: Add Exports to Skills Index

**Files:**
- Modify: `src/copilot/skills/index.ts`

### Step 1: Add exports

```typescript
// Add to src/copilot/skills/index.ts

// Seamly2D converter
export { parseSeamlyXML, type SeamlyPattern, type SeamlyConstructionStep } from './seamlyParser';
export { generateInstruction, getToolCalls } from './instructionGenerator';
export { convertSeamlyToSkill, generateTriggers, inferTags, type ImportValidation, type ConversionResult } from './seamlyToSkill';
```

### Step 2: Verify build

Run: `npm run build`
Expected: Build succeeds

### Step 3: Commit

```bash
git add src/copilot/skills/index.ts
git commit -m "feat(skills): export Seamly2D converter from index"
```

---

## Task 5: Create ImportSeamlyModal Component

**Files:**
- Create: `src/components/SkillMarketplace/ImportSeamlyModal.tsx`
- Create: `src/components/SkillMarketplace/ImportSeamlyModal.css`

### Step 1: Create the modal component

```typescript
// src/components/SkillMarketplace/ImportSeamlyModal.tsx
/**
 * ImportSeamlyModal — UI for importing Seamly2D .sm2d files as skills.
 */
import { useState, useCallback, useRef } from 'react';
import { X, Upload, AlertTriangle } from 'lucide-react';
import { convertSeamlyToSkill, type ConversionResult } from '../../copilot/skills/seamlyToSkill';
import { SkillRegistry } from '../../copilot/skills/skillRegistry';
import './ImportSeamlyModal.css';

interface ImportSeamlyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportState = 'idle' | 'parsed' | 'importing' | 'success' | 'error';

export default function ImportSeamlyModal({ isOpen, onClose }: ImportSeamlyModalProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setError(null);
    setFileName('');
    setName('');
    setAuthor('');
    setTriggers([]);
    setTags([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.sm2d') && !file.name.endsWith('.val')) {
      setError('Please select a .sm2d or .val file');
      setState('error');
      return;
    }

    try {
      const content = await file.text();
      const patternName = file.name.replace(/\.(sm2d|val)$/, '');
      const conversionResult = convertSeamlyToSkill(content, patternName);

      setResult(conversionResult);
      setFileName(file.name);
      setName(conversionResult.skill.metadata.name);
      setAuthor(conversionResult.skill.metadata.author);
      setTriggers([...conversionResult.skill.skill.triggers]);
      setTags([...conversionResult.skill.metadata.tags]);
      setState('parsed');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setState('error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = useCallback(async () => {
    if (!result) return;

    setState('importing');

    try {
      // Update skill with edited values
      const skill = { ...result.skill };
      skill.metadata = { ...skill.metadata, name, author, tags };
      skill.metadata.id = `local:${name.toLowerCase().replace(/\s+/g, '-')}`;
      skill.skill = { ...skill.skill, name, triggers };

      const registry = SkillRegistry.getInstance();
      await registry.register(skill, 'local');

      setState('success');
      setTimeout(handleClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import skill');
      setState('error');
    }
  }, [result, name, author, triggers, tags, handleClose]);

  const addTrigger = useCallback(() => {
    setTriggers([...triggers, '']);
  }, [triggers]);

  const updateTrigger = useCallback((index: number, value: string) => {
    const newTriggers = [...triggers];
    newTriggers[index] = value;
    setTriggers(newTriggers);
  }, [triggers]);

  const removeTrigger = useCallback((index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index));
  }, [triggers]);

  if (!isOpen) return null;

  return (
    <div className="import-modal-overlay" onClick={handleClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal__header">
          <h2>Import Seamly2D Pattern</h2>
          <button className="import-modal__close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="import-modal__content">
          {state === 'idle' && (
            <div
              className="import-modal__dropzone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={32} />
              <p>Drop .sm2d file here or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sm2d,.val"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {state === 'error' && error && (
            <div className="import-modal__error">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button onClick={reset}>Try Again</button>
            </div>
          )}

          {(state === 'parsed' || state === 'importing') && result && (
            <>
              <div className="import-modal__file">
                <span>📁 {fileName}</span>
              </div>

              <div className="import-modal__form">
                <label>
                  Name
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={state === 'importing'}
                  />
                </label>

                <label>
                  Author
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    disabled={state === 'importing'}
                  />
                </label>

                <label>
                  Triggers (how users will ask for this)
                  <div className="import-modal__triggers">
                    {triggers.map((t, i) => (
                      <div key={i} className="import-modal__trigger">
                        <input
                          type="text"
                          value={t}
                          onChange={(e) => updateTrigger(i, e.target.value)}
                          disabled={state === 'importing'}
                        />
                        <button onClick={() => removeTrigger(i)} disabled={state === 'importing'}>×</button>
                      </div>
                    ))}
                    <button className="import-modal__add-trigger" onClick={addTrigger} disabled={state === 'importing'}>
                      + Add trigger
                    </button>
                  </div>
                </label>
              </div>

              <div className="import-modal__preview">
                <strong>Preview:</strong>
                <p>{result.validation.stats.totalSteps} construction steps, {result.validation.stats.pieces} pieces</p>
                {result.validation.warnings.length > 0 && (
                  <p className="import-modal__warnings">
                    ⚠ {result.validation.warnings.length} warning(s)
                  </p>
                )}
              </div>
            </>
          )}

          {state === 'success' && (
            <div className="import-modal__success">
              <span>✓ Skill imported successfully!</span>
            </div>
          )}
        </div>

        <div className="import-modal__footer">
          <button className="import-modal__cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="import-modal__import"
            onClick={handleImport}
            disabled={state !== 'parsed' || !name.trim()}
          >
            {state === 'importing' ? 'Importing...' : 'Import Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Create the CSS

```css
/* src/components/SkillMarketplace/ImportSeamlyModal.css */

.import-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.import-modal {
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  width: 480px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.import-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #333);
}

.import-modal__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #ccc);
}

.import-modal__close {
  background: transparent;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 4px;
}

.import-modal__close:hover {
  color: var(--text-primary, #ccc);
}

.import-modal__content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.import-modal__dropzone {
  border: 2px dashed var(--border-color, #444);
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  color: var(--text-secondary, #888);
}

.import-modal__dropzone:hover {
  border-color: var(--accent-color, #0e639c);
  background: rgba(14, 99, 156, 0.1);
}

.import-modal__dropzone p {
  margin: 12px 0 0;
  font-size: 13px;
}

.import-modal__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(244, 135, 113, 0.1);
  border-radius: 6px;
  color: var(--error-fg, #f48771);
  font-size: 13px;
}

.import-modal__error button {
  margin-left: auto;
  padding: 4px 12px;
  background: transparent;
  border: 1px solid var(--error-fg, #f48771);
  border-radius: 4px;
  color: var(--error-fg, #f48771);
  cursor: pointer;
  font-size: 12px;
}

.import-modal__file {
  padding: 8px 12px;
  background: var(--card-bg, #252526);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary, #ccc);
  margin-bottom: 16px;
}

.import-modal__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-modal__form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.import-modal__form input {
  padding: 8px 10px;
  background: var(--input-bg, #2d2d2d);
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-primary, #ccc);
  font-size: 13px;
}

.import-modal__form input:focus {
  outline: none;
  border-color: var(--accent-color, #0e639c);
}

.import-modal__triggers {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.import-modal__trigger {
  display: flex;
  gap: 6px;
}

.import-modal__trigger input {
  flex: 1;
}

.import-modal__trigger button {
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-secondary, #888);
  cursor: pointer;
}

.import-modal__trigger button:hover {
  color: var(--error-fg, #f48771);
  border-color: var(--error-fg, #f48771);
}

.import-modal__add-trigger {
  align-self: flex-start;
  padding: 4px 10px;
  background: transparent;
  border: 1px dashed var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
}

.import-modal__add-trigger:hover {
  border-color: var(--accent-color, #0e639c);
  color: var(--accent-color, #0e639c);
}

.import-modal__preview {
  margin-top: 16px;
  padding: 12px;
  background: var(--card-bg, #252526);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.import-modal__preview strong {
  color: var(--text-primary, #ccc);
}

.import-modal__preview p {
  margin: 4px 0 0;
}

.import-modal__warnings {
  color: var(--warning-fg, #cca700);
}

.import-modal__success {
  text-align: center;
  padding: 24px;
  color: var(--success-fg, #89d185);
  font-size: 14px;
}

.import-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #333);
}

.import-modal__cancel {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-primary, #ccc);
  font-size: 13px;
  cursor: pointer;
}

.import-modal__cancel:hover {
  background: var(--card-bg, #252526);
}

.import-modal__import {
  padding: 8px 16px;
  background: var(--button-bg, #0e639c);
  border: none;
  border-radius: 4px;
  color: var(--button-fg, #fff);
  font-size: 13px;
  cursor: pointer;
}

.import-modal__import:hover:not(:disabled) {
  background: var(--button-hover-bg, #1177bb);
}

.import-modal__import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Step 3: Verify build

Run: `npm run build`
Expected: Build succeeds

### Step 4: Commit

```bash
git add src/components/SkillMarketplace/ImportSeamlyModal.tsx src/components/SkillMarketplace/ImportSeamlyModal.css
git commit -m "feat(ui): add ImportSeamlyModal component"
```

---

## Task 6: Add Import Button to SkillMarketplace

**Files:**
- Modify: `src/components/SkillMarketplace/SkillMarketplace.tsx`

### Step 1: Add import button and modal

Add these changes to `SkillMarketplace.tsx`:

```typescript
// Add import at top
import { Upload } from 'lucide-react';
import ImportSeamlyModal from './ImportSeamlyModal';

// Add state inside component
const [showImportModal, setShowImportModal] = useState(false);

// Add button in the Installed tab section (after the tabs div, before content)
{activeTab === 'installed' && (
  <div className="skill-marketplace__actions">
    <button
      className="skill-marketplace__import-btn"
      onClick={() => setShowImportModal(true)}
    >
      <Upload size={14} />
      Import .sm2d
    </button>
  </div>
)}

// Add modal at end of component (before closing div)
<ImportSeamlyModal
  isOpen={showImportModal}
  onClose={() => setShowImportModal(false)}
/>
```

### Step 2: Add CSS for import button

Add to `SkillMarketplace.css`:

```css
.skill-marketplace__actions {
  padding: 0 12px 12px;
}

.skill-marketplace__import-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  background: var(--button-secondary-bg, #333);
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  color: var(--text-primary, #ccc);
  cursor: pointer;
  transition: background 0.15s;
}

.skill-marketplace__import-btn:hover {
  background: var(--button-secondary-hover-bg, #3c3c3c);
}
```

### Step 3: Verify build

Run: `npm run build`
Expected: Build succeeds

### Step 4: Commit

```bash
git add src/components/SkillMarketplace/SkillMarketplace.tsx src/components/SkillMarketplace/SkillMarketplace.css
git commit -m "feat(ui): add Import .sm2d button to SkillMarketplace"
```

---

## Task 7: Run Tests and Final Commit

### Step 1: Run all tests

Run: `npm test -- --run`
Expected: All tests pass

### Step 2: Run build

Run: `npm run build`
Expected: Build succeeds

### Step 3: Final commit and push

```bash
git add -A
git commit -m "feat(skills): complete Seamly2D to .oskill converter

Issue #173: Seamly2D to .oskill Converter Bridge

- seamlyParser.ts: Browser-compatible XML parser
- instructionGenerator.ts: Natural language step templates
- seamlyToSkill.ts: Main converter with metadata generation
- ImportSeamlyModal: UI for import with drag-drop and editing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git push
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create XML Parser (seamlyParser.ts) |
| 2 | Create Instruction Generator |
| 3 | Create Main Converter (seamlyToSkill.ts) |
| 4 | Add Exports to Skills Index |
| 5 | Create ImportSeamlyModal Component |
| 6 | Add Import Button to SkillMarketplace |
| 7 | Run Tests and Final Commit |
