# Intelligent Context Generation - Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the copilot infer missing parameters with 100% accuracy using expert garment knowledge.

**Architecture:** PieceClassifier + SemanticResolver + MeasurementCalculator + ContextEnricher

**Epic Issue:** #209

---

## Problem Statement

Current copilot fails when user says "reduce el escote 2cm":
```
Error: No suitable edge found for "undefined"
Available edges: shoulder, sideSeam, hemline, neckline...
```

The Planner generates `edgeName: undefined` because:
1. `serializeContext()` doesn't include edge names
2. No mapping from "escote" → "neckline"
3. No expert knowledge about garment construction

## Solution Overview

**Principle:** Non-deterministic resolution + Deterministic validation = 100% accuracy

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 1. PIECE CLASSIFIER                                     │
│    Classifies pieces by geometry → "bodice-front", etc. │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. SEMANTIC RESOLVER (Expert)                           │
│    - Garment Knowledge Base (edges per piece type)      │
│    - Non-deterministic: fuzzy match, LLM fallback       │
│    - Deterministic: validate against real edges         │
│    - If ambiguous: ask user (100% accurate)             │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. MEASUREMENT CALCULATOR                               │
│    - Integrates body measurements from avatar           │
│    - Calculates deltas from current edge lengths        │
│    - Pre-computes values for Planner                    │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. CONTEXT ENRICHER                                     │
│    - Filters relevant pieces only                       │
│    - Includes edges with current measurements           │
│    - Adds related body measurements                     │
│    - Generates lean but complete context                │
└─────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. PLANNER (existing, enhanced prompt)                  │
│    Receives resolved entities, not raw user terms       │
└─────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. PieceClassifier

Classifies pattern pieces by analyzing geometry.

```typescript
interface PieceClassification {
  pieceId: string;
  type: PieceType;
  confidence: number;
  side?: 'front' | 'back' | 'left' | 'right';
}

type PieceType =
  | 'bodice-front' | 'bodice-back'
  | 'sleeve'
  | 'pants-front' | 'pants-back'
  | 'skirt-front' | 'skirt-back'
  | 'collar'
  | 'cuff'
  | 'unknown';

function classifyPiece(piece: PatternPiece): PieceClassification;
```

### 2. SemanticResolver

Resolves user terms to technical names using expert knowledge.

```typescript
interface Resolution {
  intent: 'modify_edge' | 'modify_piece' | 'create' | 'query';
  entities: {
    edges: ResolvedEdge[];
    pieces: ResolvedPiece[];
    values: ParsedValue[];
  };
  confidence: 'certain' | 'probable' | 'ambiguous';
}

interface ResolvedEdge {
  userTerm: string;      // "escote"
  resolved: string;      // "neckline"
  pieceIds: string[];    // pieces that have this edge
  confidence: number;
}

async function resolve(
  request: string,
  pieces: PatternPiece[],
  classifications: PieceClassification[]
): Promise<Resolution>;
```

### 3. GarmentKnowledge

Static knowledge base about garment construction.

```typescript
interface PieceTypeKnowledge {
  expectedEdges: string[];
  edgeSemantics: Record<string, string[]>;  // technical → user terms
  measurementRelations: Record<string, string>;  // edge → body measurement
}

const GARMENT_KNOWLEDGE: Record<PieceType, PieceTypeKnowledge> = {
  'bodice-front': {
    expectedEdges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline', 'centerFront'],
    edgeSemantics: {
      'neckline': ['escote', 'cuello', 'neck', 'neckline'],
      'shoulder': ['hombro', 'shoulder'],
      'armhole': ['sisa', 'armhole'],
      'sideSeam': ['costado', 'lateral', 'side'],
      'hemline': ['bajo', 'hem', 'ruedo'],
      'centerFront': ['centro', 'center front', 'cf'],
    },
    measurementRelations: {
      'neckline': 'neckCircumference',
      'shoulder': 'shoulderWidth',
      'armhole': 'armholeDepth',
      'hemline': 'bustCircumference',
    }
  },
  'bodice-back': {
    expectedEdges: ['neckline', 'shoulder', 'armhole', 'sideSeam', 'hemline', 'centerBack'],
    edgeSemantics: {
      'neckline': ['escote', 'cuello', 'neck', 'neckline'],
      'shoulder': ['hombro', 'shoulder'],
      'armhole': ['sisa', 'armhole'],
      'sideSeam': ['costado', 'lateral', 'side'],
      'hemline': ['bajo', 'hem', 'ruedo'],
      'centerBack': ['centro espalda', 'center back', 'cb'],
    },
    measurementRelations: {
      'neckline': 'neckCircumference',
      'shoulder': 'shoulderWidth',
      'armhole': 'armholeDepth',
      'hemline': 'bustCircumference',
    }
  },
  'sleeve': {
    expectedEdges: ['cap', 'underarm', 'hem', 'backSeam', 'frontSeam'],
    edgeSemantics: {
      'cap': ['copa', 'cabeza', 'cap', 'sleeve head'],
      'hem': ['puño', 'bajo', 'hem', 'cuff'],
      'underarm': ['axila', 'underarm', 'bajo brazo'],
    },
    measurementRelations: {
      'cap': 'armholeDepth',
      'hem': 'wristCircumference',
      'length': 'armLength',
    }
  },
  // ... pants, skirt, collar, cuff
};
```

### 4. MeasurementCalculator

Integrates body measurements for calculations.

```typescript
interface MeasurementContext {
  bodyMeasurements: Record<string, number>;  // from avatar
  edgeLengths: Record<string, Record<string, number>>;  // pieceId → edge → length
}

interface CalculatedValue {
  targetValue: number;
  currentValue: number;
  delta: number;
  unit: 'mm' | 'cm';
  relatedMeasurement?: {
    name: string;
    value: number;
  };
}

function calculate(
  resolution: Resolution,
  context: MeasurementContext
): CalculatedValue;
```

### 5. ContextEnricher

Generates enriched context for the Planner.

```typescript
interface EnrichedContext {
  resolvedIntent: string;
  targets: Array<{
    pieceId: string;
    pieceName: string;
    pieceType: PieceType;
    edge: string;
    currentLength: number;
  }>;
  calculation: CalculatedValue;
  relatedMeasurements: Record<string, number>;
  availableEdgesPerPiece: Record<string, string[]>;
}

function enrich(
  resolution: Resolution,
  pieces: PatternPiece[],
  measurements: MeasurementContext
): EnrichedContext;
```

---

## File Structure

```
src/copilot/intelligence/
├── GarmentKnowledge.ts      # Static knowledge base
├── PieceClassifier.ts       # Geometry-based classification
├── SemanticResolver.ts      # Term resolution with validation
├── MeasurementCalculator.ts # Body measurement integration
├── ContextEnricher.ts       # Context generation for Planner
├── types.ts                 # Shared type definitions
├── __tests__/
│   ├── GarmentKnowledge.test.ts
│   ├── PieceClassifier.test.ts
│   ├── SemanticResolver.test.ts
│   ├── MeasurementCalculator.test.ts
│   └── ContextEnricher.test.ts
└── index.ts                 # Barrel export
```

---

## Integration Points

### CopilotPanel.tsx

```typescript
// Before calling bridge
const intelligence = new IntelligentContext(store.getState());
const enrichedContext = await intelligence.process(userRequest);

// Pass to plannerLLM
plannerLLM: async (userRequest) => {
  const enriched = await intelligence.process(userRequest);

  const systemPrompt = `${plannerPrompt}

## Resolved Context
${JSON.stringify(enriched, null, 2)}

Use the resolved edge names and pieceIds from above. Do NOT invent values.`;

  return provider.send([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userRequest }
  ], [], providerConfig);
}
```

---

## Data Flow Example

```
Input: "reduce el escote 2cm"

1. PieceClassifier:
   Front → bodice-front (0.95)
   Back → bodice-back (0.93)

2. SemanticResolver:
   "escote" + bodice-front → neckline (certain)
   "escote" + bodice-back → neckline (certain)
   Validated: Front.edges.includes("neckline") ✓

3. MeasurementCalculator:
   Front.neckline: 125mm
   Back.neckline: 120mm
   Delta: -20mm (2cm reduction)
   Related: neckCircumference = 380mm

4. ContextEnricher:
   {
     resolvedIntent: "modify_edge",
     targets: [
       { pieceId: "front", edge: "neckline", currentLength: 125 },
       { pieceId: "back", edge: "neckline", currentLength: 120 }
     ],
     calculation: { delta: -20, unit: "mm" }
   }

5. Planner generates:
   {
     intent: "Reduce neckline by 2cm",
     steps: [
       { tool: "modifyDimension", params: { pieceId: "front", edgeName: "neckline", delta: -20 }},
       { tool: "modifyDimension", params: { pieceId: "back", edgeName: "neckline", delta: -20 }}
     ]
   }
```

---

## Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| **0% undefined errors** | Validation against piece.edges[] before using |
| **100% accuracy** | Ask user if confidence < certain |
| **Expert inference** | GarmentKnowledge per piece type |
| **Measurement-aware** | MeasurementCalculator integrates avatar |
| **Multilingual** | Non-deterministic resolution (fuzzy + LLM) |

---

## Success Metrics

1. **Zero undefined errors** on common operations
2. **95%+ auto-resolution** without asking user
3. **<100ms latency** for resolution (no LLM path)
4. **100% accuracy** when resolution succeeds

---

## Migration Phases

### Phase 1: Core Intelligence
- GarmentKnowledge with bodice + sleeve
- SemanticResolver with validation
- ContextEnricher basic

### Phase 2: Measurements
- MeasurementCalculator
- Body measurement integration
- Calculation pre-computation

### Phase 3: Expand Knowledge
- Add pants, skirt, collar, cuff
- Improve PieceClassifier accuracy
- Add more edge semantics

### Phase 4: Learning (Future)
- Track successful resolutions
- Learn new term mappings
- Per-project customization

---

## Related Issues

- #209 - Epic: Intelligent Context Generation
- #208 - Copilot persistence and memory
- #203 - Copilot Bridge Architecture
