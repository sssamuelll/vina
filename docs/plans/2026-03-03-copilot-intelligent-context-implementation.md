# Copilot Intelligent Context — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-shot Planner with an agentic planning loop that gathers context via read-only meta-tools before outputting an execution plan, and fix the variable resolution bug in ExecutionBridge.

**Architecture:** Two-phase pipeline: (1) AgenticPlanner uses the LLM's tool_use API to call read-only meta-tools (getGarmentState, getPieceDetails, measureEdge, searchPieces) until it has enough context, then outputs an ExecutionPlan JSON. (2) Executor runs the plan step-by-step with variable resolution. EnhancedReasoner handles failures with meta-tool access for smart retry. Domain bootstrap prompt gives the LLM garment vocabulary without dictionaries — the LLM does semantic mapping naturally.

**Tech Stack:** TypeScript, Vitest, existing LLMProvider interface (supports tool_use via Anthropic/OpenAI APIs), existing ToolRegistry pattern.

**Important context:**
- An `IntelligentContext` system already exists at `src/copilot/reasoning/intelligence/` with deterministic dictionaries. We are NOT extending it — we're building a parallel, LLM-driven approach. The existing system can coexist as fallback.
- The LLM provider infrastructure already supports tool_use/function_calling (`LLMProvider.send()` accepts `tools: ProviderToolDef[]`, returns `toolCalls: ProviderToolCall[]`).
- `CopilotPanel.tsx` currently builds the system prompt and calls the LLM. The AgenticPlanner will take over this responsibility.
- `ExecutionBridge.executeExecuteStep()` passes `step.params` directly without resolving `$stepId.field` variable references — this is a bug that must be fixed.

---

### Task 1: Meta-Tool Type Definitions

**Files:**
- Create: `src/copilot/reasoning/bridge/meta-tools/types.ts`
- Test: `src/copilot/reasoning/bridge/meta-tools/__tests__/types.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/reasoning/bridge/meta-tools/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  MetaToolDefinition,
  MetaToolResult,
  GarmentStateResult,
  PieceDetailsResult,
  EdgeMeasurementResult,
  PieceSearchResult,
} from '../types';

describe('Meta-tool types', () => {
  it('MetaToolDefinition has name, description, parameters, execute', () => {
    const def: MetaToolDefinition = {
      name: 'testTool',
      description: 'A test meta-tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true, data: {} }),
    };
    expect(def.name).toBe('testTool');
    expect(def.execute).toBeInstanceOf(Function);
  });

  it('GarmentStateResult contains pieces array', () => {
    const result: GarmentStateResult = {
      pieces: [
        {
          id: 'p1',
          name: 'Front Bodice',
          category: 'bodice',
          side: 'front',
          edges: ['neckline', 'shoulder', 'armhole'],
          area: 1200,
          perimeter: 450,
        },
      ],
      seams: [],
      pieceCount: 1,
    };
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].edges).toContain('neckline');
  });

  it('PieceDetailsResult contains full edge info', () => {
    const result: PieceDetailsResult = {
      id: 'p1',
      name: 'Front Bodice',
      edges: [
        { name: 'neckline', length: 125, edgeType: 'seam' },
      ],
      darts: [],
      dimensions: { width: 300, height: 400 },
      category: 'bodice',
      side: 'front',
    };
    expect(result.edges[0].length).toBe(125);
  });

  it('EdgeMeasurementResult contains length', () => {
    const result: EdgeMeasurementResult = {
      pieceId: 'p1',
      edgeName: 'neckline',
      length: 125.5,
      unit: 'mm',
    };
    expect(result.length).toBe(125.5);
  });

  it('PieceSearchResult contains matches with scores', () => {
    const result: PieceSearchResult = {
      matches: [
        { pieceId: 'p1', pieceName: 'Front Bodice', score: 0.95, reason: 'Name match' },
      ],
    };
    expect(result.matches[0].score).toBe(0.95);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/meta-tools/__tests__/types.test.ts`
Expected: FAIL — module not found

**Step 3: Write the type definitions**

```typescript
// src/copilot/reasoning/bridge/meta-tools/types.ts
import type { ToolParametersSchema } from '../../../action/tools/registry';
import type { RootState } from '../../../../store';

/**
 * A read-only meta-tool callable during agentic planning.
 * Meta-tools query garment state but never modify it.
 */
export interface MetaToolDefinition {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (
    params: Record<string, unknown>,
    getState: () => RootState,
  ) => Promise<MetaToolResult>;
}

export interface MetaToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ─── Result Types ────────────────────────────────────────────────────────────

export interface GarmentPieceSummary {
  id: string;
  name: string;
  category?: string;
  side?: string;
  edges: string[];
  area: number;
  perimeter: number;
}

export interface GarmentStateResult {
  pieces: GarmentPieceSummary[];
  seams: Array<{ id: string; pieceAId: string; pieceBId: string }>;
  pieceCount: number;
}

export interface EdgeInfo {
  name: string;
  length: number;
  edgeType: string;
}

export interface PieceDetailsResult {
  id: string;
  name: string;
  edges: EdgeInfo[];
  darts: Array<{ id: string; position: string }>;
  dimensions: { width: number; height: number };
  category?: string;
  side?: string;
}

export interface EdgeMeasurementResult {
  pieceId: string;
  edgeName: string;
  length: number;
  unit: string;
}

export interface PieceSearchResult {
  matches: Array<{
    pieceId: string;
    pieceName: string;
    score: number;
    reason: string;
  }>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/reasoning/bridge/meta-tools/__tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/meta-tools/types.ts src/copilot/reasoning/bridge/meta-tools/__tests__/types.test.ts
git commit -m "feat(copilot): add meta-tool type definitions for agentic planning"
```

---

### Task 2: Meta-Tool Implementations

**Files:**
- Create: `src/copilot/reasoning/bridge/meta-tools/getGarmentState.ts`
- Create: `src/copilot/reasoning/bridge/meta-tools/getPieceDetails.ts`
- Create: `src/copilot/reasoning/bridge/meta-tools/measureEdge.ts`
- Create: `src/copilot/reasoning/bridge/meta-tools/searchPieces.ts`
- Create: `src/copilot/reasoning/bridge/meta-tools/index.ts`
- Test: `src/copilot/reasoning/bridge/meta-tools/__tests__/metaTools.test.ts`

**Reference files:**
- `src/copilot/action/tools/definitions/analysisTools.ts` — Pattern for reading garment state
- `src/types/types.ts` — PatternPiece, SemanticEdge types
- `src/utils/semanticEdges.ts` — `detectSemanticEdges()` function
- `src/utils/nesting.ts` — `computeArea()` function

**Step 1: Write the failing tests**

```typescript
// src/copilot/reasoning/bridge/meta-tools/__tests__/metaTools.test.ts
import { describe, it, expect } from 'vitest';
import { getGarmentStateTool } from '../getGarmentState';
import { getPieceDetailsTool } from '../getPieceDetails';
import { measureEdgeTool } from '../measureEdge';
import { searchPiecesTool } from '../searchPieces';
import { getAllMetaTools } from '../index';

// Minimal mock state
function mockState(pieces: unknown[] = [], seams: unknown[] = []) {
  return () => ({
    project: {
      pieces,
      seams,
      avatar: { measurements: { chest: 90, waist: 70, hips: 95 } },
    },
  }) as never;
}

const mockPiece = {
  id: 'front-bodice',
  name: 'Front Bodice',
  category: 'bodice',
  side: 'front',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [300, 0] },
    { type: 'L', values: [300, 400] },
    { type: 'L', values: [0, 400] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  edges: [
    { id: 'e1', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 125 },
    { id: 'e2', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 140 },
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('getGarmentState', () => {
  it('returns all pieces with edges', async () => {
    const result = await getGarmentStateTool.execute({}, mockState([mockPiece]));
    expect(result.success).toBe(true);
    expect(result.data?.pieces).toHaveLength(1);
    const p = (result.data?.pieces as unknown[])[0] as Record<string, unknown>;
    expect(p.id).toBe('front-bodice');
    expect(p.edges).toContain('neckline');
  });

  it('returns empty array when no pieces', async () => {
    const result = await getGarmentStateTool.execute({}, mockState());
    expect(result.success).toBe(true);
    expect(result.data?.pieceCount).toBe(0);
  });
});

describe('getPieceDetails', () => {
  it('returns detailed edge info for a piece', async () => {
    const result = await getPieceDetailsTool.execute(
      { pieceId: 'front-bodice' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    const edges = result.data?.edges as Array<{ name: string; length: number }>;
    expect(edges).toBeDefined();
    expect(edges.find(e => e.name === 'neckline')?.length).toBe(125);
  });

  it('returns error for unknown piece', async () => {
    const result = await getPieceDetailsTool.execute(
      { pieceId: 'nonexistent' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('measureEdge', () => {
  it('returns length of a named edge', async () => {
    const result = await measureEdgeTool.execute(
      { pieceId: 'front-bodice', edgeName: 'neckline' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    expect(result.data?.length).toBe(125);
    expect(result.data?.unit).toBe('mm');
  });

  it('returns error for unknown edge', async () => {
    const result = await measureEdgeTool.execute(
      { pieceId: 'front-bodice', edgeName: 'nonexistent' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
  });
});

describe('searchPieces', () => {
  it('finds pieces by name substring', async () => {
    const result = await searchPiecesTool.execute(
      { query: 'bodice' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    const matches = result.data?.matches as Array<{ pieceId: string }>;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pieceId).toBe('front-bodice');
  });

  it('finds pieces by category', async () => {
    const result = await searchPiecesTool.execute(
      { query: 'front' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    const matches = result.data?.matches as Array<{ pieceId: string }>;
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('getAllMetaTools', () => {
  it('returns 4 meta-tools', () => {
    const tools = getAllMetaTools();
    expect(tools).toHaveLength(4);
    expect(tools.map(t => t.name)).toEqual(
      expect.arrayContaining(['getGarmentState', 'getPieceDetails', 'measureEdge', 'searchPieces']),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/meta-tools/__tests__/metaTools.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement the meta-tools**

```typescript
// src/copilot/reasoning/bridge/meta-tools/getGarmentState.ts
import type { MetaToolDefinition } from './types';
import { computeArea } from '../../../../utils/nesting';

export const getGarmentStateTool: MetaToolDefinition = {
  name: 'getGarmentState',
  description:
    'Get an overview of the current garment: all pattern pieces with their edges, area, and perimeter. ' +
    'Call this first to understand what pieces exist before making modifications.',
  parameters: { type: 'object', properties: {} },
  execute: async (_params, getState) => {
    const state = getState();
    const { pieces, seams } = state.project;

    const pieceSummaries = pieces.map(piece => {
      const edgeNames = (piece.edges ?? []).map(e => e.name);
      let area = 0;
      try { area = Math.round(computeArea(piece.outline)); } catch { /* ignore */ }

      return {
        id: piece.id,
        name: piece.name,
        category: piece.category,
        side: piece.side,
        edges: edgeNames,
        area,
        perimeter: 0, // Simplified — full calc available via measureEdge
      };
    });

    const seamSummaries = seams.map(s => ({
      id: s.id,
      pieceAId: (s as Record<string, unknown>).pieceAId as string ?? '',
      pieceBId: (s as Record<string, unknown>).pieceBId as string ?? '',
    }));

    return {
      success: true,
      data: {
        pieces: pieceSummaries,
        seams: seamSummaries,
        pieceCount: pieces.length,
      },
    };
  },
};
```

```typescript
// src/copilot/reasoning/bridge/meta-tools/getPieceDetails.ts
import type { MetaToolDefinition } from './types';

export const getPieceDetailsTool: MetaToolDefinition = {
  name: 'getPieceDetails',
  description:
    'Get detailed information about a specific pattern piece: all edges with lengths, darts, dimensions. ' +
    'Call this when you need to know exact edge names and measurements for a piece.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'The ID of the piece to inspect' },
    },
    required: ['pieceId'],
  },
  execute: async (params, getState) => {
    const state = getState();
    const pieceId = params.pieceId as string;
    const piece = state.project.pieces.find(p => p.id === pieceId);

    if (!piece) {
      return { success: false, error: `Piece "${pieceId}" not found` };
    }

    const edges = (piece.edges ?? []).map(e => ({
      name: e.name,
      length: e.length ?? 0,
      edgeType: e.edgeType ?? 'unknown',
    }));

    const darts = (piece.darts ?? []).map(d => ({
      id: d.id ?? '',
      position: String(d.position ?? ''),
    }));

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        minX = Math.min(minX, cmd.values[i]);
        minY = Math.min(minY, cmd.values[i + 1]);
        maxX = Math.max(maxX, cmd.values[i]);
        maxY = Math.max(maxY, cmd.values[i + 1]);
      }
    }

    return {
      success: true,
      data: {
        id: piece.id,
        name: piece.name,
        edges,
        darts,
        dimensions: {
          width: Math.round(maxX - minX),
          height: Math.round(maxY - minY),
        },
        category: piece.category,
        side: piece.side,
      },
    };
  },
};
```

```typescript
// src/copilot/reasoning/bridge/meta-tools/measureEdge.ts
import type { MetaToolDefinition } from './types';

export const measureEdgeTool: MetaToolDefinition = {
  name: 'measureEdge',
  description:
    'Measure the length of a specific edge on a pattern piece. ' +
    'Returns the length in millimeters. Use this to get exact current measurements before modifications.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'The ID of the piece' },
      edgeName: { type: 'string', description: 'The name of the edge to measure (e.g. "neckline", "armhole")' },
    },
    required: ['pieceId', 'edgeName'],
  },
  execute: async (params, getState) => {
    const state = getState();
    const pieceId = params.pieceId as string;
    const edgeName = params.edgeName as string;
    const piece = state.project.pieces.find(p => p.id === pieceId);

    if (!piece) {
      return { success: false, error: `Piece "${pieceId}" not found` };
    }

    const edges = piece.edges ?? [];
    const edge = edges.find(
      e => e.name.toLowerCase() === edgeName.toLowerCase(),
    );

    if (!edge) {
      const available = edges.map(e => e.name).join(', ');
      return {
        success: false,
        error: `Edge "${edgeName}" not found on piece "${piece.name}". Available edges: ${available || 'none'}`,
      };
    }

    return {
      success: true,
      data: {
        pieceId,
        edgeName: edge.name,
        length: edge.length ?? 0,
        unit: 'mm',
      },
    };
  },
};
```

```typescript
// src/copilot/reasoning/bridge/meta-tools/searchPieces.ts
import type { MetaToolDefinition } from './types';

export const searchPiecesTool: MetaToolDefinition = {
  name: 'searchPieces',
  description:
    'Search for pattern pieces by name, category, or description. ' +
    'Use this when the user refers to a piece by a general name (e.g. "front", "sleeve", "bodice") ' +
    'and you need to find the matching piece ID.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (name, category, or description)' },
    },
    required: ['query'],
  },
  execute: async (params, getState) => {
    const state = getState();
    const query = (params.query as string).toLowerCase();
    const pieces = state.project.pieces;

    const matches = pieces
      .map(piece => {
        let score = 0;
        const reasons: string[] = [];

        // Name match
        if (piece.name.toLowerCase().includes(query)) {
          score += 0.8;
          reasons.push('Name match');
        }

        // Category match
        if (piece.category?.toLowerCase().includes(query)) {
          score += 0.7;
          reasons.push('Category match');
        }

        // Side match
        if (piece.side?.toLowerCase() === query) {
          score += 0.5;
          reasons.push('Side match');
        }

        // ID match
        if (piece.id.toLowerCase().includes(query)) {
          score += 0.6;
          reasons.push('ID match');
        }

        return {
          pieceId: piece.id,
          pieceName: piece.name,
          score,
          reason: reasons.join(', '),
        };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      success: true,
      data: { matches },
    };
  },
};
```

```typescript
// src/copilot/reasoning/bridge/meta-tools/index.ts
export type { MetaToolDefinition, MetaToolResult } from './types';
export { getGarmentStateTool } from './getGarmentState';
export { getPieceDetailsTool } from './getPieceDetails';
export { measureEdgeTool } from './measureEdge';
export { searchPiecesTool } from './searchPieces';

import type { MetaToolDefinition } from './types';
import { getGarmentStateTool } from './getGarmentState';
import { getPieceDetailsTool } from './getPieceDetails';
import { measureEdgeTool } from './measureEdge';
import { searchPiecesTool } from './searchPieces';

export function getAllMetaTools(): MetaToolDefinition[] {
  return [getGarmentStateTool, getPieceDetailsTool, measureEdgeTool, searchPiecesTool];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/copilot/reasoning/bridge/meta-tools/__tests__/metaTools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/meta-tools/
git commit -m "feat(copilot): implement read-only meta-tools for agentic planning"
```

---

### Task 3: Domain Bootstrap Prompt

**Files:**
- Create: `src/copilot/reasoning/bridge/domainBootstrap.ts`
- Test: `src/copilot/reasoning/bridge/__tests__/domainBootstrap.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/reasoning/bridge/__tests__/domainBootstrap.test.ts
import { describe, it, expect } from 'vitest';
import { buildDomainBootstrap } from '../domainBootstrap';

describe('buildDomainBootstrap', () => {
  it('returns a non-empty string', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('mentions garment pattern modification', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt.toLowerCase()).toContain('garment');
    expect(prompt.toLowerCase()).toContain('pattern');
  });

  it('mentions available piece types', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt).toContain('bodice');
    expect(prompt).toContain('sleeve');
  });

  it('mentions edge types', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt).toContain('neckline');
    expect(prompt).toContain('armhole');
  });

  it('mentions multilingual capability', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt.toLowerCase()).toContain('language');
  });

  it('includes ExecutionPlan JSON format instructions', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt).toContain('"intent"');
    expect(prompt).toContain('"steps"');
    expect(prompt).toContain('"execute"');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/domainBootstrap.test.ts`
Expected: FAIL

**Step 3: Implement the domain bootstrap**

```typescript
// src/copilot/reasoning/bridge/domainBootstrap.ts

/**
 * Builds the static domain knowledge prompt for the AgenticPlanner.
 *
 * This is NOT a dictionary — it gives the LLM enough context about garment
 * construction so it can map user terms in any language to internal identifiers.
 * The LLM handles semantic mapping naturally.
 */
export function buildDomainBootstrap(): string {
  return `You are a garment pattern modification assistant for a professional CAD application.

## Your Role
You help modify pattern pieces by creating execution plans. You can call meta-tools to inspect the current garment state before creating your plan.

## Domain Knowledge
Garment patterns consist of flat pattern pieces that are sewn together to create 3D garments.

Common piece types: bodice (front/back), sleeve, skirt (front/back), pants (front/back), collar, cuff, waistband, facing, lining.

Common edge types on pieces:
- neckline, shoulder, armhole, sideSeam, hemline, centerFront, centerBack
- waistline, hipline, crotchSeam, inseam, outseam (for pants/skirts)
- sleeveHead, sleeveHem, underarm (for sleeves)

## Multilingual Support
Users may describe modifications in any language. Map their terms to the internal edge/piece names.
Use the meta-tools (getGarmentState, getPieceDetails, measureEdge, searchPieces) to discover the actual piece IDs and edge names in the project.

## Workflow
1. Call getGarmentState() to see what pieces exist
2. Call getPieceDetails(pieceId) or measureEdge(pieceId, edgeName) for specific info
3. Once you have enough context, output your ExecutionPlan as JSON

## Output Format
When ready, respond with ONLY a valid JSON execution plan:

\`\`\`json
{
  "intent": "brief description of what this plan accomplishes",
  "steps": [
    {
      "type": "execute",
      "id": "step1",
      "tool": "toolName",
      "params": { "param1": "concreteValue" },
      "label": "Human-readable step description"
    }
  ]
}
\`\`\`

Rules:
- Each step must have a unique id
- Use CONCRETE values in params (not variable references) since you gathered context via meta-tools
- Use only tools from the available tool list
- Output valid JSON only — no explanations outside the JSON`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/domainBootstrap.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/domainBootstrap.ts src/copilot/reasoning/bridge/__tests__/domainBootstrap.test.ts
git commit -m "feat(copilot): add domain bootstrap prompt for agentic planner"
```

---

### Task 4: AgenticPlanner

**Files:**
- Create: `src/copilot/reasoning/bridge/AgenticPlanner.ts`
- Test: `src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts`

**Reference files:**
- `src/copilot/providers/types.ts` — LLMProvider, ChatMessage, ProviderToolDef, ProviderToolCall, ProviderResponse
- `src/copilot/reasoning/bridge/Planner.ts` — `parsePlan()` for JSON validation
- `src/copilot/reasoning/bridge/meta-tools/` — Meta-tools from Task 2

**Step 1: Write the failing tests**

```typescript
// src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AgenticPlanner } from '../AgenticPlanner';
import type { ProviderResponse, ProviderToolCall } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';

// Mock LLM that responds with tool calls then a plan
function createMockSend(responses: ProviderResponse[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return response;
  });
}

// Minimal meta-tool
const mockMetaTool: MetaToolDefinition = {
  name: 'getGarmentState',
  description: 'Get garment state',
  parameters: { type: 'object', properties: {} },
  execute: vi.fn(async () => ({
    success: true,
    data: { pieces: [{ id: 'p1', name: 'Front', edges: ['neckline'] }], pieceCount: 1 },
  })),
};

const validPlanJson = JSON.stringify({
  intent: 'Reduce neckline by 2cm',
  steps: [
    { type: 'execute', id: 'step1', tool: 'modifyEdge', params: { pieceId: 'p1', edge: 'neckline', delta: -20 }, label: 'Modify neckline' },
  ],
});

describe('AgenticPlanner', () => {
  it('produces a plan without meta-tool calls if LLM responds directly', async () => {
    const send = createMockSend([
      { content: validPlanJson, toolCalls: [], usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    const plan = await planner.plan('reduce neckline 2cm');
    expect(plan.intent).toBe('Reduce neckline by 2cm');
    expect(plan.steps).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('calls meta-tools when LLM requests them', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'getGarmentState',
      arguments: '{}',
    };

    const send = createMockSend([
      // First response: LLM wants to call a meta-tool
      { content: '', toolCalls: [toolCall], usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } },
      // Second response: LLM outputs the plan
      { content: validPlanJson, toolCalls: [], usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 } },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [mockMetaTool],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    const plan = await planner.plan('reduce escote 2cm');
    expect(plan.intent).toBe('Reduce neckline by 2cm');
    expect(send).toHaveBeenCalledTimes(2);
    expect(mockMetaTool.execute).toHaveBeenCalled();
  });

  it('respects maxMetaToolCalls limit', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'getGarmentState',
      arguments: '{}',
    };

    // LLM always wants to call tools (never outputs plan)
    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: '', toolCalls: [toolCall] },
      { content: '', toolCalls: [toolCall] },
      { content: '', toolCalls: [toolCall] },
      { content: '', toolCalls: [toolCall] },
      { content: '', toolCalls: [toolCall] },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [mockMetaTool],
      toolSchemas: [],
      getState: () => ({}) as never,
      maxMetaToolCalls: 3,
    });

    await expect(planner.plan('test')).rejects.toThrow('Max meta-tool calls');
  });

  it('throws PlannerError for invalid JSON response', async () => {
    const send = createMockSend([
      { content: 'not valid json', toolCalls: [] },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    await expect(planner.plan('test')).rejects.toThrow();
  });

  it('tracks meta-tool calls for debugging', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'getGarmentState',
      arguments: '{}',
    };

    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: validPlanJson, toolCalls: [] },
    ]);

    const planner = new AgenticPlanner({
      send,
      metaTools: [mockMetaTool],
      toolSchemas: [],
      getState: () => ({}) as never,
    });

    const plan = await planner.plan('test');
    expect(plan).toBeDefined();
    expect(planner.getLastMetaToolCalls()).toHaveLength(1);
    expect(planner.getLastMetaToolCalls()[0].name).toBe('getGarmentState');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts`
Expected: FAIL

**Step 3: Implement AgenticPlanner**

```typescript
// src/copilot/reasoning/bridge/AgenticPlanner.ts
import type { ChatMessage, ProviderToolDef, ProviderResponse, ProviderToolCall } from '../../providers/types';
import type { ToolParametersSchema } from '../../action/tools/registry';
import type { ExecutionPlan } from './types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { RootState } from '../../../store';
import { Planner, PlannerError } from './Planner';
import { buildDomainBootstrap } from './domainBootstrap';

export interface MetaToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
}

export interface AgenticPlannerOptions {
  /** LLM send function (from provider) */
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;
  /** Read-only meta-tools for context gathering */
  metaTools: MetaToolDefinition[];
  /** Write tool schemas (shown in prompt but not callable during planning) */
  toolSchemas: Array<{ name: string; description: string; parameters: ToolParametersSchema }>;
  /** State accessor for meta-tool execution */
  getState: () => RootState;
  /** Max meta-tool calls before giving up (default: 5) */
  maxMetaToolCalls?: number;
  /** Provider config to pass through to send */
  providerConfig?: unknown;
}

export class AgenticPlanner {
  private send: AgenticPlannerOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private toolSchemas: AgenticPlannerOptions['toolSchemas'];
  private getState: () => RootState;
  private maxMetaToolCalls: number;
  private providerConfig: unknown;
  private parser: Planner;
  private lastMetaToolCalls: MetaToolCallRecord[] = [];

  constructor(options: AgenticPlannerOptions) {
    this.send = options.send;
    this.metaTools = new Map(options.metaTools.map(t => [t.name, t]));
    this.toolSchemas = options.toolSchemas;
    this.getState = options.getState;
    this.maxMetaToolCalls = options.maxMetaToolCalls ?? 5;
    this.providerConfig = options.providerConfig;
    this.parser = new Planner();
  }

  /** Get meta-tool calls from the last planning run (for debugging). */
  getLastMetaToolCalls(): MetaToolCallRecord[] {
    return [...this.lastMetaToolCalls];
  }

  async plan(userRequest: string): Promise<ExecutionPlan> {
    this.lastMetaToolCalls = [];
    let metaToolCallCount = 0;

    const systemPrompt = this.buildSystemPrompt();
    const metaToolDefs = this.buildMetaToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.send(messages, metaToolDefs, this.providerConfig);

      // If LLM returns content without tool calls, it's the final plan
      if (response.toolCalls.length === 0) {
        return this.parser.parsePlan(response.content);
      }

      // LLM wants to call meta-tools
      for (const toolCall of response.toolCalls) {
        metaToolCallCount++;
        if (metaToolCallCount > this.maxMetaToolCalls) {
          throw new PlannerError(
            `Max meta-tool calls (${this.maxMetaToolCalls}) exceeded during planning`,
          );
        }

        const result = await this.executeMetaTool(toolCall);

        // Add assistant message with tool call
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: [toolCall],
        });

        // Add tool result message
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  private async executeMetaTool(
    toolCall: ProviderToolCall,
  ): Promise<unknown> {
    const metaTool = this.metaTools.get(toolCall.name);

    if (!metaTool) {
      const error = { success: false, error: `Unknown meta-tool: ${toolCall.name}` };
      this.lastMetaToolCalls.push({
        name: toolCall.name,
        arguments: {},
        result: error,
        duration: 0,
      });
      return error;
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      args = {};
    }

    const start = performance.now();
    const result = await metaTool.execute(args, this.getState);
    const duration = performance.now() - start;

    this.lastMetaToolCalls.push({
      name: toolCall.name,
      arguments: args,
      result: result.data ?? result.error,
      duration,
    });

    return result;
  }

  private buildSystemPrompt(): string {
    const domain = buildDomainBootstrap();

    // List available write tools (for plan generation, not callable during planning)
    const toolList = this.toolSchemas
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');

    return `${domain}

## Available Tools (for your execution plan)
${toolList || 'No tools registered.'}`;
  }

  private buildMetaToolDefs(): ProviderToolDef[] {
    return Array.from(this.metaTools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/AgenticPlanner.ts src/copilot/reasoning/bridge/__tests__/AgenticPlanner.test.ts
git commit -m "feat(copilot): implement AgenticPlanner with tool_use loop"
```

---

### Task 5: Fix Variable Resolution in ExecutionBridge

**Files:**
- Modify: `src/copilot/reasoning/bridge/ExecutionBridge.ts`
- Test: `src/copilot/reasoning/bridge/__tests__/ExecutionBridge.test.ts` (existing or create)

**Context:** `ExecutionBridge.executeExecuteStep()` passes `step.params` directly to tools without resolving `$stepId.field` variable references. The `Executor` class has `resolveParams()` but `ExecutionBridge` does its own execution logic without it.

**Step 1: Write the failing test**

```typescript
// src/copilot/reasoning/bridge/__tests__/variableResolution.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';

describe('ExecutionBridge variable resolution', () => {
  it('resolves $stepId.result.field references in step params', async () => {
    const capturedParams: Record<string, unknown>[] = [];

    const bridge = new ExecutionBridge({
      plannerLLM: async () => JSON.stringify({
        intent: 'test variable resolution',
        steps: [
          { type: 'execute', id: 'step1', tool: 'getThing', params: {}, label: 'Get thing' },
          { type: 'execute', id: 'step2', tool: 'useThing', params: { value: '$step1.result.name' }, label: 'Use thing' },
        ],
      }),
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        getThing: async () => {
          capturedParams.push({});
          return { success: true, data: { name: 'resolved-value' } };
        },
        useThing: async (params) => {
          capturedParams.push(params);
          return { success: true, data: {} };
        },
      },
    });

    const result = await bridge.run('test');
    expect(result.success).toBe(true);
    // The second tool should receive the resolved value, not the variable reference
    expect(capturedParams[1]).toEqual({ value: 'resolved-value' });
  });

  it('passes through non-variable params unchanged', async () => {
    const capturedParams: Record<string, unknown>[] = [];

    const bridge = new ExecutionBridge({
      plannerLLM: async () => JSON.stringify({
        intent: 'test',
        steps: [
          { type: 'execute', id: 'step1', tool: 'doThing', params: { name: 'plain-value', count: 42 }, label: 'Do' },
        ],
      }),
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const, reason: 'test' }),
      tools: {
        doThing: async (params) => {
          capturedParams.push(params);
          return { success: true, data: {} };
        },
      },
    });

    await bridge.run('test');
    expect(capturedParams[0]).toEqual({ name: 'plain-value', count: 42 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/variableResolution.test.ts`
Expected: FAIL — second test's capturedParams[1] will be `{ value: '$step1.result.name' }` instead of `{ value: 'resolved-value' }`

**Step 3: Fix ExecutionBridge — add ResultStore and variable resolution**

In `src/copilot/reasoning/bridge/ExecutionBridge.ts`, make these changes:

1. Import ResultStore:
```typescript
import { ResultStore } from './ResultStore';
```

2. Add `resultStore` field in the class:
```typescript
private resultStore = new ResultStore();
```

3. Clear ResultStore at the start of `executePlan()`:
```typescript
private async executePlan(...) {
  this.resultStore.clear();
  const results: StepResult[] = [];
  // ... rest unchanged
```

4. Store step results after each step in `executePlan()`:
```typescript
// After: results.push(stepResult);
this.resultStore.add(stepResult);
```

5. Add `resolveParams()` method:
```typescript
private resolveParams(params: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      resolved[key] = this.resultStore.resolve(value);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
```

6. Call `resolveParams` in `executeExecuteStep()`:
```typescript
private async executeExecuteStep(step: ExecuteStep): Promise<StepResult> {
  const tool = this.tools[step.tool];
  if (!tool) {
    return { stepId: step.id, success: false, error: `Unknown tool: ${step.tool}` };
  }
  try {
    const resolvedParams = this.resolveParams(step.params);
    const result = await tool(resolvedParams);
    // ... rest unchanged
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/variableResolution.test.ts`
Expected: PASS

**Step 5: Run all existing bridge tests**

Run: `npx vitest run src/copilot/reasoning/bridge/`
Expected: All existing tests still PASS

**Step 6: Commit**

```bash
git add src/copilot/reasoning/bridge/ExecutionBridge.ts src/copilot/reasoning/bridge/__tests__/variableResolution.test.ts
git commit -m "fix(copilot): resolve variable references in ExecutionBridge step execution"
```

---

### Task 6: EnhancedReasoner

**Files:**
- Create: `src/copilot/reasoning/bridge/EnhancedReasoner.ts`
- Test: `src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EnhancedReasoner } from '../EnhancedReasoner';
import type { ReasonerInput } from '../types';
import type { ProviderResponse, ProviderToolCall } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';

const mockInput: ReasonerInput = {
  failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: { pieceId: 'bad-id' }, label: 'Modify' },
  error: 'Piece "bad-id" not found',
  resultsSoFar: [],
  originalIntent: 'reduce neckline 2cm',
};

const retryDecision = JSON.stringify({
  action: 'retry',
  newParams: { pieceId: 'front-bodice' },
  reason: 'Found correct piece via searchPieces',
});

const searchTool: MetaToolDefinition = {
  name: 'searchPieces',
  description: 'Search pieces',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  execute: vi.fn(async () => ({
    success: true,
    data: { matches: [{ pieceId: 'front-bodice', pieceName: 'Front Bodice', score: 0.9 }] },
  })),
};

function createMockSend(responses: ProviderResponse[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return response;
  });
}

describe('EnhancedReasoner', () => {
  it('returns a decision without meta-tool calls', async () => {
    const send = createMockSend([
      { content: retryDecision, toolCalls: [] },
    ]);

    const reasoner = new EnhancedReasoner({
      send,
      metaTools: [],
      getState: () => ({}) as never,
    });

    const decision = await reasoner.analyze(mockInput);
    expect(decision.action).toBe('retry');
    expect(decision.newParams?.pieceId).toBe('front-bodice');
  });

  it('calls meta-tools to search for correct params', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'searchPieces',
      arguments: JSON.stringify({ query: 'front' }),
    };

    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: retryDecision, toolCalls: [] },
    ]);

    const reasoner = new EnhancedReasoner({
      send,
      metaTools: [searchTool],
      getState: () => ({}) as never,
    });

    const decision = await reasoner.analyze(mockInput);
    expect(decision.action).toBe('retry');
    expect(searchTool.execute).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('returns abort on LLM error', async () => {
    const send = vi.fn(async () => { throw new Error('LLM failed'); });

    const reasoner = new EnhancedReasoner({
      send,
      metaTools: [],
      getState: () => ({}) as never,
    });

    const decision = await reasoner.analyze(mockInput);
    expect(decision.action).toBe('abort');
    expect(decision.reason).toContain('LLM failed');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts`
Expected: FAIL

**Step 3: Implement EnhancedReasoner**

```typescript
// src/copilot/reasoning/bridge/EnhancedReasoner.ts
import type { ChatMessage, ProviderToolDef, ProviderResponse, ProviderToolCall } from '../../providers/types';
import type { ReasonerInput, ReasonerDecision, IReasoner } from './types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { RootState } from '../../../store';
import { isExecuteStep } from './types';

export interface EnhancedReasonerOptions {
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;
  metaTools: MetaToolDefinition[];
  getState: () => RootState;
  maxMetaToolCalls?: number;
  providerConfig?: unknown;
}

const VALID_ACTIONS = ['retry', 'alternative', 'askUser', 'abort'] as const;

export class EnhancedReasoner implements IReasoner {
  private send: EnhancedReasonerOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private getState: () => RootState;
  private maxMetaToolCalls: number;
  private providerConfig: unknown;

  constructor(options: EnhancedReasonerOptions) {
    this.send = options.send;
    this.metaTools = new Map(options.metaTools.map(t => [t.name, t]));
    this.getState = options.getState;
    this.maxMetaToolCalls = options.maxMetaToolCalls ?? 3;
    this.providerConfig = options.providerConfig;
  }

  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    try {
      return await this.analyzeWithTools(input);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { action: 'abort', reason: `Reasoner error: ${msg}` };
    }
  }

  private async analyzeWithTools(input: ReasonerInput): Promise<ReasonerDecision> {
    let metaToolCallCount = 0;
    const metaToolDefs = this.buildMetaToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildPrompt(input) },
      { role: 'user', content: 'Analyze this failure and decide how to recover.' },
    ];

    while (true) {
      const response = await this.send(messages, metaToolDefs, this.providerConfig);

      if (response.toolCalls.length === 0) {
        return this.parseDecision(response.content);
      }

      for (const toolCall of response.toolCalls) {
        metaToolCallCount++;
        if (metaToolCallCount > this.maxMetaToolCalls) {
          return { action: 'abort', reason: 'Max meta-tool calls exceeded during recovery' };
        }

        const result = await this.executeMetaTool(toolCall);
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: [toolCall],
        });
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  private async executeMetaTool(toolCall: ProviderToolCall): Promise<unknown> {
    const metaTool = this.metaTools.get(toolCall.name);
    if (!metaTool) {
      return { success: false, error: `Unknown meta-tool: ${toolCall.name}` };
    }
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(toolCall.arguments); } catch { /* empty */ }
    return metaTool.execute(args, this.getState);
  }

  private buildPrompt(input: ReasonerInput): string {
    const { failedStep, error, resultsSoFar, originalIntent } = input;
    const stepInfo = isExecuteStep(failedStep)
      ? `Tool: ${failedStep.tool}\nParams: ${JSON.stringify(failedStep.params, null, 2)}`
      : `Input: ${failedStep.input}\nDecide: ${failedStep.decide}`;

    const prevResults = resultsSoFar.length === 0
      ? 'None'
      : resultsSoFar.map(r => `- ${r.stepId}: ${r.success ? 'OK' : 'FAIL'} ${r.data ? JSON.stringify(r.data) : ''}`).join('\n');

    return `You are an error recovery assistant for a garment CAD copilot.

A step failed. Use the meta-tools to investigate (e.g., searchPieces to find correct piece IDs, getPieceDetails to check edge names).

## Original Intent
${originalIntent}

## Failed Step
${stepInfo}

## Error
${error}

## Previous Results
${prevResults}

## Actions
Respond with JSON:
- {"action": "retry", "newParams": {...}, "reason": "..."} — retry with corrected params
- {"action": "alternative", "newStep": {...}, "reason": "..."} — use different step
- {"action": "askUser", "question": "...", "options": [...]} — ask user to clarify
- {"action": "abort", "reason": "..."} — cannot recover`;
  }

  private parseDecision(content: string): ReasonerDecision {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && VALID_ACTIONS.includes(parsed.action)) {
        return parsed as ReasonerDecision;
      }
    } catch { /* fall through */ }

    // Try extracting JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (VALID_ACTIONS.includes(parsed.action)) return parsed as ReasonerDecision;
      } catch { /* fall through */ }
    }

    return { action: 'abort', reason: 'Could not parse reasoner response' };
  }

  private buildMetaToolDefs(): ProviderToolDef[] {
    return Array.from(this.metaTools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/reasoning/bridge/EnhancedReasoner.ts src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts
git commit -m "feat(copilot): implement EnhancedReasoner with meta-tool access for smart retry"
```

---

### Task 7: Wire AgenticPlanner into ExecutionBridge

**Files:**
- Modify: `src/copilot/reasoning/bridge/ExecutionBridge.ts`
- Modify: `src/copilot/reasoning/bridge/index.ts`
- Test: `src/copilot/reasoning/bridge/__tests__/agenticIntegration.test.ts`

**Context:** Replace the `plannerLLM` string function with an optional `agenticPlanner` and the basic `Reasoner` with an optional `EnhancedReasoner`. The bridge should support both the old interface (for backwards compat) and the new agentic interface.

**Step 1: Write the failing test**

```typescript
// src/copilot/reasoning/bridge/__tests__/agenticIntegration.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';
import { AgenticPlanner } from '../AgenticPlanner';
import { EnhancedReasoner } from '../EnhancedReasoner';

describe('ExecutionBridge with AgenticPlanner', () => {
  it('uses AgenticPlanner when provided in options', async () => {
    const planSpy = vi.fn(async () => ({
      intent: 'test',
      steps: [
        { type: 'execute' as const, id: 's1', tool: 'doThing', params: { x: 1 }, label: 'Do thing' },
      ],
    }));

    const mockPlanner = { plan: planSpy, getLastMetaToolCalls: () => [] } as unknown as AgenticPlanner;

    const bridge = new ExecutionBridge({
      plannerLLM: async () => '', // Shouldn't be called
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const }),
      tools: {
        doThing: async () => ({ success: true, data: {} }),
      },
      agenticPlanner: mockPlanner,
    });

    const result = await bridge.run('test request');
    expect(result.success).toBe(true);
    expect(planSpy).toHaveBeenCalledWith('test request');
  });

  it('falls back to plannerLLM when AgenticPlanner not provided', async () => {
    const plannerLLM = vi.fn(async () => JSON.stringify({
      intent: 'fallback test',
      steps: [
        { type: 'execute', id: 's1', tool: 'doThing', params: {}, label: 'Do' },
      ],
    }));

    const bridge = new ExecutionBridge({
      plannerLLM,
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const }),
      tools: {
        doThing: async () => ({ success: true, data: {} }),
      },
    });

    const result = await bridge.run('test');
    expect(result.success).toBe(true);
    expect(plannerLLM).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/agenticIntegration.test.ts`
Expected: FAIL — `agenticPlanner` not accepted in BridgeOptions

**Step 3: Modify ExecutionBridge to accept AgenticPlanner**

In `src/copilot/reasoning/bridge/ExecutionBridge.ts`:

1. Add import:
```typescript
import type { AgenticPlanner } from './AgenticPlanner';
```

2. Extend BridgeOptions:
```typescript
export interface BridgeOptions {
  plannerLLM: PlannerLLM;
  evaluator: Evaluator;
  reasonerLLM: ReasonerLLM;
  tools: ToolRegistry;
  config?: BridgeConfig;
  /** Optional agentic planner (replaces plannerLLM when provided) */
  agenticPlanner?: AgenticPlanner;
}
```

3. Store in constructor:
```typescript
private agenticPlanner: AgenticPlanner | null;
// In constructor:
this.agenticPlanner = options.agenticPlanner ?? null;
```

4. Modify `generatePlan()`:
```typescript
private async generatePlan(userRequest: string): Promise<ExecutionPlan> {
  if (this.agenticPlanner) {
    return this.agenticPlanner.plan(userRequest);
  }
  // Legacy path
  const llmResponse = await this.plannerLLM(userRequest);
  return this.planner.parsePlan(llmResponse);
}
```

5. Export AgenticPlanner and EnhancedReasoner from barrel:

In `src/copilot/reasoning/bridge/index.ts`, add:
```typescript
export { AgenticPlanner, type AgenticPlannerOptions } from './AgenticPlanner';
export { EnhancedReasoner, type EnhancedReasonerOptions } from './EnhancedReasoner';
export { getAllMetaTools } from './meta-tools';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/agenticIntegration.test.ts`
Expected: PASS

**Step 5: Run all bridge tests**

Run: `npx vitest run src/copilot/reasoning/bridge/`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/copilot/reasoning/bridge/ExecutionBridge.ts src/copilot/reasoning/bridge/index.ts src/copilot/reasoning/bridge/__tests__/agenticIntegration.test.ts
git commit -m "feat(copilot): wire AgenticPlanner into ExecutionBridge"
```

---

### Task 8: Update CopilotPanel to Use AgenticPlanner

**Files:**
- Modify: `src/components/CopilotPanel/CopilotPanel.tsx`
- Modify: `src/copilot/hooks/useBridge.ts`

**Context:** Replace the inline `plannerLLM` function in CopilotPanel with AgenticPlanner construction. The planner now handles its own system prompt, meta-tool calls, and context gathering. useBridge needs to accept the AgenticPlanner.

**Step 1: Modify useBridge to accept AgenticPlanner**

In `src/copilot/hooks/useBridge.ts`:

1. Add import:
```typescript
import type { AgenticPlanner } from '../reasoning/bridge/AgenticPlanner';
import type { EnhancedReasoner } from '../reasoning/bridge/EnhancedReasoner';
```

2. Extend UseBridgeOptions:
```typescript
export interface UseBridgeOptions {
  plannerLLM: (prompt: string) => Promise<string>;
  evaluator: (input: unknown, question: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  reasonerLLM: ReasonerLLM;
  /** Optional agentic planner (replaces plannerLLM) */
  agenticPlanner?: AgenticPlanner;
  /** Optional enhanced reasoner (replaces reasonerLLM) */
  enhancedReasoner?: EnhancedReasoner;
}
```

3. Pass through to createDebugBridge:
```typescript
const { bridge } = createDebugBridge({
  plannerLLM: async (userRequest) => options.plannerLLM(userRequest),
  evaluator: options.evaluator,
  reasonerLLM: options.reasonerLLM,
  tools,
  config: DEFAULT_BRIDGE_CONFIG,
  agenticPlanner: options.agenticPlanner,
});
```

**Step 2: Modify CopilotPanel to create AgenticPlanner**

In `src/components/CopilotPanel/CopilotPanel.tsx`:

1. Add imports:
```typescript
import { AgenticPlanner } from '../../copilot/reasoning/bridge/AgenticPlanner';
import { EnhancedReasoner } from '../../copilot/reasoning/bridge/EnhancedReasoner';
import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';
```

2. Replace the `plannerLLM` inline function with AgenticPlanner construction.

Create the planner outside useBridge:
```typescript
// Before the useBridge call, create the agentic planner
const agenticPlannerRef = useRef<AgenticPlanner | null>(null);

const getAgenticPlanner = useCallback(() => {
  if (!providerConfig || !agenticPlannerRef.current) {
    if (!providerConfig) return null;
    const provider = getProvider(providerConfig);
    const registry = getDefaultRegistry();
    const toolSchemas = registry.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    agenticPlannerRef.current = new AgenticPlanner({
      send: (messages, tools) => provider.send(messages, tools, providerConfig),
      metaTools: getAllMetaTools(),
      toolSchemas,
      getState: () => store.getState(),
      providerConfig,
    });
  }
  return agenticPlannerRef.current;
}, [providerConfig]);
```

3. Pass to useBridge:
```typescript
const bridgeHook = useBridge({
  plannerLLM: async (userRequest) => {
    // Legacy fallback (only used if agenticPlanner is null)
    if (!providerConfig) return '';
    const provider = getProvider(providerConfig);
    const response = await provider.send(
      [{ role: 'user', content: userRequest }],
      [],
      providerConfig,
    );
    return response.content;
  },
  evaluator: async () => ({ success: true, data: { decision: 'proceed' } }),
  reasonerLLM: async (prompt) => {
    if (!providerConfig) return { action: 'abort' as const, reason: 'No provider' };
    const provider = getProvider(providerConfig);
    const response = await provider.send([{ role: 'user', content: prompt }], [], providerConfig);
    try { return JSON.parse(response.content); } catch { return { action: 'abort' as const, reason: 'Parse error' }; }
  },
  agenticPlanner: getAgenticPlanner() ?? undefined,
});
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/CopilotPanel/CopilotPanel.tsx src/copilot/hooks/useBridge.ts
git commit -m "feat(copilot): wire AgenticPlanner into CopilotPanel and useBridge"
```

---

### Task 9: Update Debug Suite for Meta-Tool Tracking

**Files:**
- Modify: `src/copilot/debug/types.ts`
- Modify: `src/copilot/debug/ExecutionRecorder.ts`
- Modify: `src/copilot/debug/ConsoleLogger.ts`
- Modify: `src/copilot/debug/createDebugBridge.ts`
- Test: `src/copilot/debug/__tests__/metaToolTracking.test.ts`

**Step 1: Write the failing test**

```typescript
// src/copilot/debug/__tests__/metaToolTracking.test.ts
import { describe, it, expect } from 'vitest';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { MetaToolCallRecord } from '../types';

describe('ExecutionRecorder meta-tool tracking', () => {
  it('records meta-tool calls during planning', () => {
    const recorder = new ExecutionRecorder();
    recorder.start('test request');

    const metaToolCalls: MetaToolCallRecord[] = [
      { name: 'getGarmentState', arguments: {}, result: { pieces: [] }, duration: 50 },
      { name: 'getPieceDetails', arguments: { pieceId: 'p1' }, result: { edges: [] }, duration: 30 },
    ];
    recorder.recordPlanningMetaToolCalls(metaToolCalls);

    const record = recorder.finalize();
    expect(record.planning.metaToolCalls).toHaveLength(2);
    expect(record.planning.metaToolCalls![0].name).toBe('getGarmentState');
    expect(record.planning.metaToolCalls![1].duration).toBe(30);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/copilot/debug/__tests__/metaToolTracking.test.ts`
Expected: FAIL

**Step 3: Update debug types**

In `src/copilot/debug/types.ts`, add:

```typescript
export interface MetaToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
}
```

Add `metaToolCalls` to PlanningRecord:
```typescript
export interface PlanningRecord {
  systemPrompt: string;
  toolsProvided: string[];
  rawResponse: string;
  parsedPlan: ExecutionPlan | null;
  parseError?: string;
  duration: number;
  tokenUsage?: TokenUsage;
  metaToolCalls?: MetaToolCallRecord[];
}
```

**Step 4: Update ExecutionRecorder**

In `src/copilot/debug/ExecutionRecorder.ts`, add method:

```typescript
import type { MetaToolCallRecord } from './types';

// Add to class:
recordPlanningMetaToolCalls(calls: MetaToolCallRecord[]): void {
  this.planning.metaToolCalls = calls;
}
```

**Step 5: Update ConsoleLogger**

In `src/copilot/debug/ConsoleLogger.ts`, in the `logPlanning` method, add after the planning duration line:

```typescript
if (planning.metaToolCalls && planning.metaToolCalls.length > 0) {
  console.log(`%c  Meta-tool calls: ${planning.metaToolCalls.length}`, 'color: #9b59b6');
  for (const call of planning.metaToolCalls) {
    console.log(`    ${call.name}(${JSON.stringify(call.arguments)}) → ${Math.round(call.duration)}ms`);
  }
}
```

**Step 6: Update createDebugBridge**

In `src/copilot/debug/createDebugBridge.ts`, after the `execution:complete` handler, add meta-tool tracking. If the bridge has an AgenticPlanner, capture its `getLastMetaToolCalls()`:

```typescript
// In the plan:start event handler, capture meta-tool calls from AgenticPlanner
if (event.type === 'plan:start' && options.agenticPlanner) {
  const metaToolCalls = options.agenticPlanner.getLastMetaToolCalls();
  recorder.recordPlanningMetaToolCalls(metaToolCalls);
}
```

Also update the BridgeOptions import to include `agenticPlanner`.

**Step 7: Run test to verify it passes**

Run: `npx vitest run src/copilot/debug/__tests__/metaToolTracking.test.ts`
Expected: PASS

**Step 8: Run all debug tests**

Run: `npx vitest run src/copilot/debug/`
Expected: All PASS

**Step 9: Commit**

```bash
git add src/copilot/debug/
git commit -m "feat(debug): add meta-tool call tracking to debug suite"
```

---

### Task 10: Integration Test — Full Agentic Pipeline

**Files:**
- Create: `src/copilot/reasoning/bridge/__tests__/agenticPipeline.test.ts`

**Step 1: Write the integration test**

```typescript
// src/copilot/reasoning/bridge/__tests__/agenticPipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ExecutionBridge } from '../ExecutionBridge';
import { AgenticPlanner } from '../AgenticPlanner';
import type { ProviderResponse, ProviderToolCall } from '../../../providers/types';

/**
 * Integration test: Full agentic pipeline
 * User says "reduce neckline 2cm" →
 *   AgenticPlanner calls getGarmentState → getPieceDetails → outputs plan →
 *   Executor runs modifyEdge with concrete params →
 *   Success
 */
describe('Full agentic pipeline integration', () => {
  it('plans with meta-tools and executes with concrete params', async () => {
    const garmentState = {
      success: true,
      data: {
        pieces: [{ id: 'front', name: 'Front Bodice', edges: ['neckline', 'shoulder'] }],
        pieceCount: 1,
      },
    };

    const pieceDetails = {
      success: true,
      data: {
        id: 'front',
        name: 'Front Bodice',
        edges: [{ name: 'neckline', length: 125, edgeType: 'seam' }],
      },
    };

    const executionPlan = JSON.stringify({
      intent: 'Reduce neckline by 20mm',
      steps: [
        {
          type: 'execute',
          id: 'step1',
          tool: 'modifyEdge',
          params: { pieceId: 'front', edgeName: 'neckline', delta: -20 },
          label: 'Reduce neckline by 20mm',
        },
      ],
    });

    let sendCallCount = 0;
    const send = vi.fn(async () => {
      sendCallCount++;
      if (sendCallCount === 1) {
        // First call: LLM wants getGarmentState
        return {
          content: '',
          toolCalls: [{ id: 'tc1', name: 'getGarmentState', arguments: '{}' }],
        } as ProviderResponse;
      }
      if (sendCallCount === 2) {
        // Second call: LLM wants getPieceDetails
        return {
          content: '',
          toolCalls: [{ id: 'tc2', name: 'getPieceDetails', arguments: '{"pieceId":"front"}' }],
        } as ProviderResponse;
      }
      // Third call: LLM outputs the plan
      return { content: executionPlan, toolCalls: [] } as ProviderResponse;
    });

    // Mock meta-tools
    const metaTools = [
      {
        name: 'getGarmentState',
        description: 'Get garment state',
        parameters: { type: 'object' as const, properties: {} },
        execute: vi.fn(async () => garmentState),
      },
      {
        name: 'getPieceDetails',
        description: 'Get piece details',
        parameters: { type: 'object' as const, properties: { pieceId: { type: 'string' } }, required: ['pieceId'] },
        execute: vi.fn(async () => pieceDetails),
      },
    ];

    const agenticPlanner = new AgenticPlanner({
      send,
      metaTools,
      toolSchemas: [{ name: 'modifyEdge', description: 'Modify an edge', parameters: { type: 'object', properties: {} } }],
      getState: () => ({ project: { pieces: [], seams: [] } }) as never,
    });

    // Track what params modifyEdge receives
    let receivedParams: Record<string, unknown> = {};

    const bridge = new ExecutionBridge({
      plannerLLM: async () => '',
      evaluator: async () => ({ success: true }),
      reasonerLLM: async () => ({ action: 'abort' as const }),
      tools: {
        modifyEdge: async (params) => {
          receivedParams = params;
          return { success: true, data: { newLength: 105, oldLength: 125 } };
        },
      },
      agenticPlanner,
    });

    const result = await bridge.run('reduce el escote 2cm');

    // Verify the full pipeline worked
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(metaTools[0].execute).toHaveBeenCalled(); // getGarmentState
    expect(metaTools[1].execute).toHaveBeenCalled(); // getPieceDetails
    expect(receivedParams).toEqual({ pieceId: 'front', edgeName: 'neckline', delta: -20 });
  });
});
```

**Step 2: Run test**

Run: `npx vitest run src/copilot/reasoning/bridge/__tests__/agenticPipeline.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/copilot/reasoning/bridge/__tests__/agenticPipeline.test.ts
git commit -m "test(copilot): add full agentic pipeline integration test"
```

---

### Task 11: Final Verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Verify file structure**

Expected new/modified files:
```
src/copilot/reasoning/bridge/
├── AgenticPlanner.ts                           # NEW
├── EnhancedReasoner.ts                         # NEW
├── ExecutionBridge.ts                           # MODIFIED (variable resolution + AgenticPlanner)
├── domainBootstrap.ts                           # NEW
├── index.ts                                     # MODIFIED (new exports)
├── meta-tools/
│   ├── types.ts                                # NEW
│   ├── getGarmentState.ts                      # NEW
│   ├── getPieceDetails.ts                      # NEW
│   ├── measureEdge.ts                          # NEW
│   ├── searchPieces.ts                         # NEW
│   ├── index.ts                                # NEW
│   └── __tests__/
│       ├── types.test.ts                       # NEW
│       └── metaTools.test.ts                   # NEW
└── __tests__/
    ├── domainBootstrap.test.ts                 # NEW
    ├── AgenticPlanner.test.ts                  # NEW
    ├── EnhancedReasoner.test.ts                # NEW
    ├── variableResolution.test.ts              # NEW
    ├── agenticIntegration.test.ts              # NEW
    └── agenticPipeline.test.ts                 # NEW

src/copilot/debug/
├── types.ts                                    # MODIFIED (MetaToolCallRecord)
├── ExecutionRecorder.ts                        # MODIFIED (recordPlanningMetaToolCalls)
├── ConsoleLogger.ts                            # MODIFIED (meta-tool output)
├── createDebugBridge.ts                        # MODIFIED (capture meta-tool calls)
└── __tests__/
    └── metaToolTracking.test.ts                # NEW

src/copilot/hooks/useBridge.ts                  # MODIFIED (accept AgenticPlanner)
src/components/CopilotPanel/CopilotPanel.tsx    # MODIFIED (create AgenticPlanner)
```

**Step 4: Commit final verification**

```bash
git commit --allow-empty -m "chore: verify all tests and types pass for intelligent context feature"
```
