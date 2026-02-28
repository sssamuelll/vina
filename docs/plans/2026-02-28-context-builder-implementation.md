# Context Builder Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade contextBuilder to inject Cerebral Context (semantic landmarks, spatial relationships, design decisions, user overrides) into the LLM system prompt.

**Architecture:** Extend existing `src/copilot/contextBuilder.ts` with new functions that build and serialize `CerebralContext`. Uses vision layer modules (geometryClassifier, spatialDescriber, designLog, preferenceLearner).

**Tech Stack:** TypeScript, Vitest, existing vision layer exports

---

## Task 1: Add Piece Semantics Builder

**Files:**
- Modify: `src/copilot/contextBuilder.ts`
- Create: `src/copilot/__tests__/contextBuilder.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/__tests__/contextBuilder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPieceSemantics } from '../contextBuilder';
import type { PatternPiece } from '@/types/types';

describe('Context Builder - Piece Semantics', () => {
  const testPiece: PatternPiece = {
    id: 'front-bodice',
    name: 'Front Bodice',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should build piece semantics with fingerprint', () => {
    const semantics = buildPieceSemantics(testPiece);

    expect(semantics.pieceId).toBe('front-bodice');
    expect(semantics.fingerprint).toBeDefined();
    expect(semantics.fingerprint.pieceId).toBe('front-bodice');
    expect(semantics.fingerprint.segmentTypes).toBeDefined();
  });

  it('should include landmarks in fingerprint', () => {
    const semantics = buildPieceSemantics(testPiece);

    expect(semantics.fingerprint.landmarks).toBeDefined();
    expect(Array.isArray(semantics.fingerprint.landmarks)).toBe(true);
  });

  it('should compute curvature density', () => {
    const semantics = buildPieceSemantics(testPiece);

    expect(typeof semantics.fingerprint.curvatureDensity).toBe('number');
    expect(semantics.fingerprint.curvatureDensity).toBeGreaterThanOrEqual(0);
    expect(semantics.fingerprint.curvatureDensity).toBeLessThanOrEqual(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/__tests__/contextBuilder.test.ts`

**Step 3: Write implementation**

Add to `contextBuilder.ts`:

```typescript
import type { PieceSemantics, GeometricFingerprint } from './vision/types';
import { generateFingerprint } from './vision';

/**
 * Build semantic analysis for a single piece.
 */
export function buildPieceSemantics(piece: PatternPiece): PieceSemantics {
  const fingerprint = generateFingerprint(piece.id, piece.outline);

  return {
    pieceId: piece.id,
    fingerprint,
    // bestMatch and avatarProximity are optional, computed separately
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/contextBuilder.ts src/copilot/__tests__/contextBuilder.test.ts
git commit -m "feat(copilot): add piece semantics builder

- buildPieceSemantics generates fingerprint for a piece
- Uses geometryClassifier's generateFingerprint
- Returns PieceSemantics with landmarks and ratios

Part of #186"
```

---

## Task 2: Add Spatial Relationships Builder

**Files:**
- Modify: `src/copilot/contextBuilder.ts`
- Modify: `src/copilot/__tests__/contextBuilder.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { buildSpatialRelationships } from '../contextBuilder';
import type { Seam } from '@/types/types';

describe('Context Builder - Spatial Relationships', () => {
  const pieces: PatternPiece[] = [
    {
      id: 'front',
      name: 'Front',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'back',
      name: 'Back',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 150, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const seams: Seam[] = [];

  it('should build spatial relationships between pieces', () => {
    const relationships = buildSpatialRelationships(pieces, seams);

    expect(relationships.relationships).toBeDefined();
    expect(Array.isArray(relationships.relationships)).toBe(true);
  });

  it('should detect conflicts', () => {
    const relationships = buildSpatialRelationships(pieces, seams);

    expect(relationships.conflicts).toBeDefined();
    expect(Array.isArray(relationships.conflicts)).toBe(true);
  });

  it('should return empty arrays for single piece', () => {
    const relationships = buildSpatialRelationships([pieces[0]], []);

    expect(relationships.relationships).toHaveLength(0);
    expect(relationships.conflicts).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `contextBuilder.ts`:

```typescript
import type { SpatialRelationship, SpatialConflict } from './vision/types';
import { describeSpatialRelationships } from './vision';
import type { Seam } from '../types/types';

/**
 * Result of spatial analysis.
 */
export interface SpatialAnalysisResult {
  relationships: SpatialRelationship[];
  conflicts: SpatialConflict[];
}

/**
 * Build spatial relationships between all pieces.
 */
export function buildSpatialRelationships(
  pieces: PatternPiece[],
  seams: Seam[],
): SpatialAnalysisResult {
  if (pieces.length < 2) {
    return { relationships: [], conflicts: [] };
  }

  // Convert pieces to spatial input format
  const spatialPieces = pieces.map(p => ({
    id: p.id,
    outline: p.outline,
    position: p.position,
    rotation: p.rotation,
  }));

  // Convert seams to spatial input format
  const spatialSeams = seams.map(s => ({
    id: s.id,
    pieceAId: s.pieceA.pieceId,
    pieceBId: s.pieceB.pieceId,
  }));

  const result = describeSpatialRelationships({
    pieces: spatialPieces,
    seams: spatialSeams,
  });

  return {
    relationships: result.relationships,
    conflicts: result.conflicts,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/
git commit -m "feat(copilot): add spatial relationships builder

- buildSpatialRelationships analyzes piece positions
- Uses spatialDescriber for 3D analysis
- Returns relationships and conflicts

Part of #186"
```

---

## Task 3: Add Design Log Integration

**Files:**
- Modify: `src/copilot/contextBuilder.ts`
- Modify: `src/copilot/__tests__/contextBuilder.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { getRecentDecisions } from '../contextBuilder';
import type { DesignLogEntry } from '../vision/types';

describe('Context Builder - Design Log Integration', () => {
  const entries: DesignLogEntry[] = [
    {
      id: 'entry-1',
      timestamp: Date.now() - 1000,
      type: 'decision',
      summary: 'Set bodice ease to 3cm',
      relatedPieceIds: ['front-bodice'],
    },
    {
      id: 'entry-2',
      timestamp: Date.now() - 500,
      type: 'constraint',
      summary: 'Armhole must match sleeve cap',
      relatedPieceIds: ['front-bodice', 'sleeve'],
    },
    {
      id: 'entry-3',
      timestamp: Date.now(),
      type: 'warning',
      summary: 'Grain line missing on back piece',
      relatedPieceIds: ['back-bodice'],
    },
  ];

  it('should return recent decisions', () => {
    const recent = getRecentDecisions(entries, 5);

    expect(recent).toHaveLength(3);
    expect(recent[0].id).toBe('entry-3'); // Most recent first
  });

  it('should limit to specified count', () => {
    const recent = getRecentDecisions(entries, 2);

    expect(recent).toHaveLength(2);
  });

  it('should prioritize warnings and constraints', () => {
    const recent = getRecentDecisions(entries, 2);

    // Should include warning and constraint over plain decision
    const types = recent.map(e => e.type);
    expect(types).toContain('warning');
  });

  it('should return empty array for no entries', () => {
    const recent = getRecentDecisions([], 5);

    expect(recent).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `contextBuilder.ts`:

```typescript
import type { DesignLogEntry } from './vision/types';

/** Priority weights for entry types (higher = more important) */
const ENTRY_TYPE_PRIORITY: Record<string, number> = {
  warning: 3,
  constraint: 2,
  decision: 1,
  note: 0,
};

/**
 * Get recent design decisions, prioritizing warnings and constraints.
 */
export function getRecentDecisions(
  entries: DesignLogEntry[],
  limit: number,
): DesignLogEntry[] {
  if (entries.length === 0) return [];

  // Sort by priority (desc) then timestamp (desc)
  const sorted = [...entries].sort((a, b) => {
    const priorityDiff = (ENTRY_TYPE_PRIORITY[b.type] ?? 0) - (ENTRY_TYPE_PRIORITY[a.type] ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    return b.timestamp - a.timestamp;
  });

  return sorted.slice(0, limit);
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/
git commit -m "feat(copilot): add design log integration

- getRecentDecisions retrieves prioritized entries
- Warnings and constraints ranked higher
- Configurable limit

Part of #186"
```

---

## Task 4: Add Cerebral Context Builder

**Files:**
- Modify: `src/copilot/contextBuilder.ts`
- Modify: `src/copilot/__tests__/contextBuilder.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { buildCerebralContext, type CerebralContextInput } from '../contextBuilder';
import type { SkillOverride } from '../vision/types';

describe('Context Builder - Cerebral Context', () => {
  const input: CerebralContextInput = {
    pieces: [
      {
        id: 'front',
        name: 'Front',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [100, 0] },
          { type: 'L', values: [100, 100] },
          { type: 'L', values: [0, 100] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    seams: [],
    designLogEntries: [],
    overrides: [],
  };

  it('should build complete cerebral context', () => {
    const context = buildCerebralContext(input);

    expect(context.pieceSemantics).toBeDefined();
    expect(context.spatialRelationships).toBeDefined();
    expect(context.conflicts).toBeDefined();
    expect(context.recentDecisions).toBeDefined();
    expect(context.activeOverrides).toBeDefined();
  });

  it('should include semantics for each piece', () => {
    const context = buildCerebralContext(input);

    expect(context.pieceSemantics).toHaveLength(1);
    expect(context.pieceSemantics[0].pieceId).toBe('front');
  });

  it('should include provided overrides', () => {
    const override: SkillOverride = {
      id: 'o1',
      skillId: 'core:bodice',
      formulaName: 'backWidth',
      originalValue: 'x',
      overrideValue: 'x + 5',
      reason: 'User preference',
      createdAt: Date.now(),
    };

    const context = buildCerebralContext({
      ...input,
      overrides: [override],
    });

    expect(context.activeOverrides).toHaveLength(1);
    expect(context.activeOverrides[0].skillId).toBe('core:bodice');
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `contextBuilder.ts`:

```typescript
import type { CerebralContext, SkillOverride } from './vision/types';

/**
 * Input for building cerebral context.
 */
export interface CerebralContextInput {
  /** Pattern pieces */
  pieces: PatternPiece[];
  /** Seams connecting pieces */
  seams: Seam[];
  /** Design log entries */
  designLogEntries: DesignLogEntry[];
  /** Active formula overrides */
  overrides: SkillOverride[];
  /** Maximum recent decisions to include (default: 10) */
  maxDecisions?: number;
}

/**
 * Build the complete cerebral context for LLM consumption.
 */
export function buildCerebralContext(input: CerebralContextInput): CerebralContext {
  const { pieces, seams, designLogEntries, overrides, maxDecisions = 10 } = input;

  // Build piece semantics
  const pieceSemantics = pieces.map(buildPieceSemantics);

  // Build spatial relationships
  const spatial = buildSpatialRelationships(pieces, seams);

  // Get recent decisions
  const recentDecisions = getRecentDecisions(designLogEntries, maxDecisions);

  return {
    pieceSemantics,
    spatialRelationships: spatial.relationships,
    conflicts: spatial.conflicts,
    recentDecisions,
    activeOverrides: overrides,
  };
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/
git commit -m "feat(copilot): add cerebral context builder

- buildCerebralContext combines all vision components
- Includes semantics, spatial, decisions, overrides
- Configurable decision limit

Part of #186"
```

---

## Task 5: Add Cerebral Context Serialization

**Files:**
- Modify: `src/copilot/contextBuilder.ts`
- Modify: `src/copilot/__tests__/contextBuilder.test.ts`

**Step 1: Write the failing tests**

Append to test file:

```typescript
import { serializeCerebralContext } from '../contextBuilder';
import type { CerebralContext } from '../vision/types';

describe('Context Builder - Serialization', () => {
  const context: CerebralContext = {
    pieceSemantics: [
      {
        pieceId: 'front',
        fingerprint: {
          pieceId: 'front',
          segmentTypes: ['straight', 'straight', 'straight', 'straight'],
          ratios: { 'width/height': 0.67 },
          curvatureDensity: 0,
          landmarks: [],
        },
      },
    ],
    spatialRelationships: [
      {
        pieceAId: 'front',
        pieceBId: 'back',
        type: 'adjacent',
        distance3D: 5,
        hasSewingConnection: false,
      },
    ],
    conflicts: [],
    recentDecisions: [
      {
        id: 'e1',
        timestamp: Date.now(),
        type: 'decision',
        summary: 'Use French seams',
        relatedPieceIds: ['front'],
      },
    ],
    activeOverrides: [],
  };

  it('should serialize to markdown format', () => {
    const serialized = serializeCerebralContext(context);

    expect(serialized).toContain('## Piece Analysis');
    expect(serialized).toContain('front');
  });

  it('should include spatial relationships', () => {
    const serialized = serializeCerebralContext(context);

    expect(serialized).toContain('Spatial');
    expect(serialized).toContain('adjacent');
  });

  it('should include recent decisions', () => {
    const serialized = serializeCerebralContext(context);

    expect(serialized).toContain('Decision');
    expect(serialized).toContain('French seams');
  });

  it('should handle empty context', () => {
    const empty: CerebralContext = {
      pieceSemantics: [],
      spatialRelationships: [],
      conflicts: [],
      recentDecisions: [],
      activeOverrides: [],
    };

    const serialized = serializeCerebralContext(empty);

    expect(serialized).toBeDefined();
    expect(serialized.length).toBeGreaterThan(0);
  });

  it('should include overrides when present', () => {
    const withOverrides: CerebralContext = {
      ...context,
      activeOverrides: [
        {
          id: 'o1',
          skillId: 'core:bodice',
          formulaName: 'backWidth',
          originalValue: 'x',
          overrideValue: 'x + 5',
          reason: 'Wider back',
          createdAt: Date.now(),
        },
      ],
    };

    const serialized = serializeCerebralContext(withOverrides);

    expect(serialized).toContain('Override');
    expect(serialized).toContain('backWidth');
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `contextBuilder.ts`:

```typescript
/**
 * Serialize cerebral context for LLM system prompt.
 */
export function serializeCerebralContext(context: CerebralContext): string {
  const sections: string[] = [];

  // Piece analysis section
  if (context.pieceSemantics.length > 0) {
    sections.push('## Piece Analysis');
    for (const ps of context.pieceSemantics) {
      const fp = ps.fingerprint;
      const segTypes = fp.segmentTypes.join(', ');
      const density = (fp.curvatureDensity * 100).toFixed(0);
      sections.push(`- **${ps.pieceId}**: ${segTypes} | ${density}% curved`);
      if (fp.landmarks.length > 0) {
        const landmarks = fp.landmarks.map(l => l.label).join(', ');
        sections.push(`  - Landmarks: ${landmarks}`);
      }
    }
    sections.push('');
  }

  // Spatial relationships section
  if (context.spatialRelationships.length > 0) {
    sections.push('## Spatial Relationships');
    for (const rel of context.spatialRelationships) {
      const sewn = rel.hasSewingConnection ? ' [sewn]' : '';
      sections.push(`- ${rel.pieceAId} ↔ ${rel.pieceBId}: ${rel.type} (${rel.distance3D.toFixed(1)}mm)${sewn}`);
    }
    sections.push('');
  }

  // Conflicts section
  if (context.conflicts.length > 0) {
    sections.push('## ⚠️ Conflicts');
    for (const c of context.conflicts) {
      sections.push(`- [${c.severity.toUpperCase()}] ${c.type}: ${c.description}`);
    }
    sections.push('');
  }

  // Recent decisions section
  if (context.recentDecisions.length > 0) {
    sections.push('## Recent Decisions');
    for (const d of context.recentDecisions) {
      const icon = d.type === 'warning' ? '⚠️' : d.type === 'constraint' ? '🔒' : '📝';
      sections.push(`- ${icon} ${d.summary}`);
    }
    sections.push('');
  }

  // Overrides section
  if (context.activeOverrides.length > 0) {
    sections.push('## User Formula Overrides');
    for (const o of context.activeOverrides) {
      sections.push(`- **${o.formulaName}** (${o.skillId}): \`${o.overrideValue}\``);
      sections.push(`  - Reason: ${o.reason}`);
    }
    sections.push('');
  }

  if (sections.length === 0) {
    return '## Context\nNo pieces or design history yet.';
  }

  return sections.join('\n');
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/
git commit -m "feat(copilot): add cerebral context serialization

- serializeCerebralContext formats for LLM prompt
- Includes pieces, spatial, conflicts, decisions, overrides
- Markdown format with icons

Part of #186"
```

---

## Task 6: Integration and Exports

**Files:**
- Modify: `src/copilot/contextBuilder.ts`
- Modify: `src/copilot/__tests__/contextBuilder.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { buildEnhancedAgentContext } from '../contextBuilder';
import type { RootState } from '@/store';

describe('Context Builder - Enhanced Agent Context', () => {
  // Minimal mock state
  const mockState: Partial<RootState> = {
    project: {
      name: 'Test Project',
      pieces: [],
      seams: [],
      fabrics: [],
      avatar: { measurements: {} } as any,
    } as any,
    editor: {
      selectedPieceIds: [],
      selectedSeamId: null,
      activeTool: 'select',
      viewMode: '2d',
      units: 'mm',
      showSeamAllowance: true,
    } as any,
    simulation: {
      simulationState: 'idle',
      pieceFabrics: {},
    } as any,
  };

  it('should include cerebral context in enhanced agent context', () => {
    const context = buildEnhancedAgentContext(
      mockState as RootState,
      [],
      [],
      [],
    );

    expect(context.cerebral).toBeDefined();
    expect(context.cerebralSerialized).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `contextBuilder.ts`:

```typescript
/**
 * Enhanced agent context with cerebral intelligence.
 */
export interface EnhancedAgentContext extends AgentContext {
  /** Structured cerebral context */
  cerebral: CerebralContext;
  /** Serialized cerebral context for LLM prompt */
  cerebralSerialized: string;
}

/**
 * Build enhanced agent context with cerebral intelligence.
 */
export function buildEnhancedAgentContext(
  state: RootState,
  activeSkills: string[] = [],
  designLogEntries: DesignLogEntry[] = [],
  overrides: SkillOverride[] = [],
): EnhancedAgentContext {
  // Build base agent context
  const baseContext = buildAgentContext(state, activeSkills);

  // Build cerebral context
  const cerebral = buildCerebralContext({
    pieces: state.project.pieces,
    seams: state.project.seams,
    designLogEntries,
    overrides,
  });

  // Serialize for LLM
  const cerebralSerialized = serializeCerebralContext(cerebral);

  return {
    ...baseContext,
    cerebral,
    cerebralSerialized,
  };
}
```

**Step 4: Run all tests**

**Step 5: Commit**

```bash
git add src/copilot/
git commit -m "feat(copilot): add enhanced agent context

- buildEnhancedAgentContext combines base + cerebral
- Includes structured and serialized forms
- Ready for LLM integration

Closes #186"
```

---

## Task 7: Run All Tests and Close Issue

**Step 1: Run full test suite**

```bash
npm test -- --run
```

Expected: All tests pass

**Step 2: Push changes**

```bash
git push origin main
```

**Step 3: Close issue**

```bash
gh issue close 186 --comment "Upgraded Context Builder with Cerebral Context:

**New Functions:**
- \`buildPieceSemantics\`: generates fingerprint with landmarks
- \`buildSpatialRelationships\`: analyzes 3D piece positions
- \`getRecentDecisions\`: retrieves prioritized design log entries
- \`buildCerebralContext\`: combines all vision components
- \`serializeCerebralContext\`: formats for LLM prompt
- \`buildEnhancedAgentContext\`: extends base context with cerebral intelligence

**Integration:**
- Semantic landmarks from geometryClassifier
- Spatial relationships from spatialDescriber
- Design decisions from designLog
- User overrides from preferenceLearner

All functions ready for LLM system prompt injection."
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Piece semantics builder | 3 |
| 2 | Spatial relationships builder | 3 |
| 3 | Design log integration | 4 |
| 4 | Cerebral context builder | 3 |
| 5 | Context serialization | 5 |
| 6 | Integration and exports | 1 |
| 7 | Final verification | - |

**Total new tests:** 19
**Files modified:** 1 (`contextBuilder.ts`)
**Files created:** 1 (`contextBuilder.test.ts`)
