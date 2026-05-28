# OpenClo AI Agent Specification

> Blueprint for an AI pattern-making copilot that speaks the language of patronaje.
> Version 1.0 — February 2026

---

## Status — All 5 Phases Implemented ✅

As of **21 February 2026**, all five phases of the AI agent are fully implemented and tested:

| Phase | Name | Status | Key Deliverables |
|-------|------|--------|-----------------|
| 1 | Foundation | ✅ Complete | 42 tools with JSON Schema, Anthropic + OpenAI providers with streaming, PATRONAJE_SOUL.md, context builder, tool executor, project memory |
| 2 | Intelligence | ✅ Complete | Compound tools (generateFromDescription, transformPiece × 9), proactive analysis (5 checks), teaching mode (11 entries), ES/EN detection, multi-turn loop (5 rounds), smart defaults |
| 3 | Skills | ✅ Complete | Skill loader + registry, 5 core skills (bodice Aldrich/Müller/Gilewska, sleeve, skirt, collar, grading), 35 formulas, 17 drafting methods, 52 construction steps, 41 grade rules, 55 bilingual triggers |
| 4 | Polish | ✅ Complete | Error recovery (retry + fallback), cost manager (budget + model routing), Ollama local LLM, mobile UX (fullscreen, voice, chips, haptics), AgentSettings UI, ⌘/ shortcut |
| 5 | Community | ✅ Complete | Plugin system (loader, registry, manager, permissions, sandboxing, namespacing), community skills (import/export/validation), marketplace prep, language packs (ES/EN + extensible), formula plugins, PluginManager UI |

**Testing:** 997 unit tests (52 suites) + 133 E2E tests (5 suites) — all passing. `tsc -b` clean.

**Bugs fixed during implementation:** 5 total (3 found by audit: unloadPlugin cleanup, resetLoadedPlugins error handling, empty triggers validation; 2 found earlier: setBudget(0), disconnected sim button).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Agent Tools](#2-agent-tools)
3. [Agent Personality — PATRONAJE_SOUL](#3-agent-personality)
4. [Killer Use Cases](#4-killer-use-cases)
5. [Technical Implementation](#5-technical-implementation)
6. [What We Steal from OpenClaw](#6-what-we-steal-from-openclaw)
7. [What Makes This Different from CLO3D](#7-what-makes-this-different-from-clo3d)
8. [Skill System](#8-skill-system)
9. [Roadmap](#9-roadmap)

---

## 1. Architecture Overview

### 1.1 Core Loop

```
User message
    ↓
buildAgentContext(Redux state, selection, history)
    ↓
LLM (system prompt + PATRONAJE_SOUL + skill context + tools schema)
    ↓
Agent response: { message, tool_calls[] }
    ↓
executeToolCalls(tool_calls, dispatch)
    ↓
Redux state mutates → Canvas re-renders
    ↓
Agent reads updated context → confirms/adjusts
    ↓
Streamed response to UnifiedBar chat panel
```

### 1.2 State Access

The agent connects to OpenClo's Redux store through two pathways:

**READ (Context Building):**
```typescript
interface AgentContext {
  project: {
    name: string;
    pieces: PieceInfo[];           // id, name, bounds, SA, internals summary
    seams: SeamInfo[];             // connections between pieces
    fabrics: FabricInfo[];         // available fabrics with physics
    measurements: BodyMeasurements; // full 40+ measurement object
  };
  editor: {
    selectedPieceIds: string[];
    selectedSeamId: string | null;
    activeTool: Tool2D;
    viewMode: ViewMode;
    units: UnitSystem;
    showSeamAllowance: boolean;
  };
  simulation: {
    state: 'idle' | 'running' | 'paused';
    pieceFabrics: Record<string, string>;
  };
  memory: ProjectMemory;           // per-project persistent context
  message: string;
  history: Message[];              // last 20 messages
}
```

**WRITE (Command Execution):**
The agent returns `AgentCommand[]` which map to Redux dispatches. The `commandExecutor.ts` (already exists) handles this.

### 1.3 Existing Infrastructure

OpenClo already has the bones:

| Component | File | Status |
|-----------|------|--------|
| Protocol | `src/copilot/protocol.ts` | ✅ Exists — `CopilotContext`, `CopilotCommand`, `CopilotResponse` |
| Connector | `src/copilot/agentConnector.ts` | ✅ Exists — HTTP, WebSocket, built-in |
| Executor | `src/copilot/commandExecutor.ts` | ✅ Exists — dispatches to Redux |
| Chat UI | `src/components/shell/UnifiedBarChat.tsx` + `src/copilot/AgentSettings.tsx` | ✅ Exists — chat in UnifiedBar `chat` mode, settings in `settings` mode (CopilotPanel deleted in 1c6e4238) |
| Templates | `src/utils/patternTemplates.ts` | ✅ Exists — bodice, sleeve, skirt, pants, collar |
| Grading | `src/utils/grading/` | ✅ Exists — grade tables, scale outlines |
| Nesting | `src/utils/nesting/` | ✅ Exists — skyline bin packing |
| Seam Allowance | `src/utils/seam/` | ✅ Exists — equidistant offset with corner handling |
| DXF Export | `src/utils/dxf/` | ✅ Exists — AAMA/ASTM D6673 compliant |
| PDF Export | `src/utils/exportPDF.ts` | ✅ Exists — 1:1 scale A0 |
| DXF Import | `src/utils/dxf/parser.ts` | ✅ Exists — R12 and R2000+ |
| Cloth Sim | `src/utils/cloth/` | ✅ Exists — XPBD solver, fabric library |
| Formulas | `src/utils/formula/` | ✅ Exists — parametric formula evaluator |
| Project IO | `src/utils/projectIO.ts` | ✅ Exists — JSON save/load, localStorage |

**What's missing:** A proper tool system with LLM function calling, streaming, persistent memory, and the skill layer.

---

## 2. Agent Tools

Every tool has: name, description (for LLM), parameters (JSON Schema), and return type. These are registered as OpenAI-compatible function definitions.

### 2.1 Piece Operations

#### `createPiece`
Create a new pattern piece from parameters or a template.

```typescript
{
  name: "createPiece",
  description: "Create a new pattern piece on the canvas. Can create from outline points or from a named template (bodice, sleeve, skirt, pants, collar).",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Piece name (e.g. 'Front Bodice', 'Manga Derecha')" },
      template: { 
        type: "string", 
        enum: ["bodice-front", "bodice-back", "sleeve", "skirt-front", "skirt-back", "pants-front", "pants-back", "collar"],
        description: "Generate from a standard pattern block using current measurements"
      },
      outline: {
        type: "array",
        description: "SVG PathCommand array defining the piece shape. 1 unit = 1mm. Only needed if not using a template.",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["M", "L", "C", "Q", "Z"] },
            values: { type: "array", items: { type: "number" } }
          }
        }
      },
      position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
      seamAllowance: { type: "number", description: "Seam allowance in mm (default 10)" },
      mirrored: { type: "boolean", description: "Whether piece is mirrored (default false)" }
    },
    required: ["name"]
  },
  returns: { pieceId: "string", bounds: { width: "number", height: "number" } }
}
```

**Dispatch:** `addPiece()` + `selectPiece()`

#### `modifyOutline`
Replace the outline of an existing piece.

```typescript
{
  name: "modifyOutline",
  parameters: {
    pieceId: { type: "string" },
    outline: { type: "array", items: { /* PathCommand */ } }
  },
  returns: { success: "boolean", newBounds: { width: "number", height: "number" } }
}
```

**Dispatch:** `updatePiece()`

#### `modifyPoint`
Move a single control point on a piece outline.

```typescript
{
  name: "modifyPoint",
  parameters: {
    pieceId: { type: "string" },
    pointIndex: { type: "integer", description: "Index in the outline PathCommand array" },
    valueIndex: { type: "integer", description: "Index within the values array of that command" },
    x: { type: "number", description: "New x coordinate in mm" },
    y: { type: "number", description: "New y coordinate in mm" }
  },
  returns: { success: "boolean" }
}
```

**Dispatch:** `updatePiece()` with modified outline

#### `deletePiece`
Remove a pattern piece.

```typescript
{
  name: "deletePiece",
  parameters: {
    pieceId: { type: "string" }
  },
  returns: { success: "boolean" }
}
```

**Dispatch:** `removePiece()`

#### `renamePiece`
```typescript
{
  name: "renamePiece",
  parameters: {
    pieceId: { type: "string" },
    name: { type: "string" }
  },
  returns: { success: "boolean" }
}
```

#### `scalePiece`
Uniformly scale a piece.

```typescript
{
  name: "scalePiece",
  parameters: {
    pieceId: { type: "string" },
    factor: { type: "number", description: "Scale factor (1.1 = 10% larger)" }
  },
  returns: { success: "boolean", newBounds: { width: "number", height: "number" } }
}
```

#### `movePiece`
```typescript
{
  name: "movePiece",
  parameters: {
    pieceId: { type: "string" },
    x: { type: "number" },
    y: { type: "number" }
  },
  returns: { success: "boolean" }
}
```

#### `rotatePiece`
```typescript
{
  name: "rotatePiece",
  parameters: {
    pieceId: { type: "string" },
    degrees: { type: "number" }
  },
  returns: { success: "boolean" }
}
```

#### `mirrorPiece`
```typescript
{
  name: "mirrorPiece",
  parameters: {
    pieceId: { type: "string" },
    mirrored: { type: "boolean" }
  },
  returns: { success: "boolean" }
}
```

### 2.2 Internal Lines (Darts, Grainlines, Notches)

#### `addDart`
Add a dart to a piece at a calculated position.

```typescript
{
  name: "addDart",
  description: "Add a dart (pinza) to a pattern piece. Calculates position based on dart type and piece geometry.",
  parameters: {
    pieceId: { type: "string" },
    dartType: { 
      type: "string", 
      enum: ["bust", "waist-front", "waist-back", "shoulder", "neck", "elbow"],
      description: "Type determines position and direction" 
    },
    width: { type: "number", description: "Dart intake width in mm at the base" },
    length: { type: "number", description: "Dart length in mm from base to point" },
    position: {
      type: "object",
      description: "Override auto-calculated position",
      properties: {
        baseX: { type: "number" },
        baseY: { type: "number" },
        tipX: { type: "number" },
        tipY: { type: "number" }
      }
    }
  },
  required: ["pieceId", "dartType"],
  returns: { internalLineId: "string" }
}
```

**Dispatch:** `addInternalLine()` with type='dart'

#### `addGrainline`
```typescript
{
  name: "addGrainline",
  parameters: {
    pieceId: { type: "string" },
    direction: { type: "string", enum: ["vertical", "horizontal", "bias-45", "custom"], default: "vertical" },
    customAngle: { type: "number", description: "Degrees from vertical, only for custom" }
  },
  returns: { internalLineId: "string" }
}
```

**Dispatch:** `setInternalLine()` with type='grainline'

#### `addNotch`
```typescript
{
  name: "addNotch",
  description: "Add a notch mark (piquete) to a piece outline for alignment during sewing.",
  parameters: {
    pieceId: { type: "string" },
    edgePosition: { type: "number", description: "Position along the outline as a fraction 0-1" },
    shape: { type: "string", enum: ["slit", "t-notch", "v-internal", "v-external", "u-notch", "castle", "diamond"], default: "slit" },
    count: { type: "integer", enum: [1, 2, 3], default: 1, description: "Number of notch marks (1=single, 2=double for back, 3=triple)" },
    length: { type: "number", default: 8, description: "Notch depth in mm" }
  },
  required: ["pieceId", "edgePosition"],
  returns: { internalLineId: "string" }
}
```

**Dispatch:** `addInternalLine()` with type='notch' + NotchOptions

#### `addFoldLine`
```typescript
{
  name: "addFoldLine",
  parameters: {
    pieceId: { type: "string" },
    startX: { type: "number" },
    startY: { type: "number" },
    endX: { type: "number" },
    endY: { type: "number" }
  },
  returns: { internalLineId: "string" }
}
```

### 2.3 Seam Allowance

#### `setSeamAllowance`
```typescript
{
  name: "setSeamAllowance",
  description: "Set seam allowance width for a piece. Standard: 10mm (1cm). Hems usually 30-40mm.",
  parameters: {
    pieceId: { type: "string", description: "Piece ID, or 'all' for all pieces" },
    width: { type: "number", description: "Seam allowance width in mm" }
  },
  returns: { success: "boolean", piecesAffected: "number" }
}
```

**Dispatch:** `updatePiece()` for each affected piece

#### `auditSeamAllowances`
Read-only tool — checks all pieces for SA consistency.

```typescript
{
  name: "auditSeamAllowances",
  description: "Check all pieces for seam allowance consistency. Reports missing SA, mismatched SA between connected pieces, and non-standard values.",
  parameters: {},
  returns: {
    issues: [{
      pieceId: "string",
      pieceName: "string",
      issue: "string",  // "missing" | "non-standard" | "mismatch"
      detail: "string"
    }]
  }
}
```

**Implementation:** Pure read from Redux state, no dispatch needed.

### 2.4 Seam Connections

#### `createSeam`
```typescript
{
  name: "createSeam",
  description: "Connect two edges from different pieces with a seam (costura). The agent should suggest correct seam connections based on piece names and positions.",
  parameters: {
    pieceAId: { type: "string" },
    edgeAStart: { type: "integer", description: "Start segment index on piece A" },
    edgeAEnd: { type: "integer", description: "End segment index on piece A" },
    pieceBId: { type: "string" },
    edgeBStart: { type: "integer" },
    edgeBEnd: { type: "integer" },
    seamType: { type: "string", enum: ["standard", "french", "flat-felled", "overlock"], default: "standard" }
  },
  returns: { seamId: "string" }
}
```

**Dispatch:** `addSeam()`

#### `removeSeam`
```typescript
{
  name: "removeSeam",
  parameters: { seamId: { type: "string" } },
  returns: { success: "boolean" }
}
```

### 2.5 Grading

#### `gradePiece`
```typescript
{
  name: "gradePiece",
  description: "Grade a pattern piece from its base size to a target size. Uses measurement-based scaling.",
  parameters: {
    pieceId: { type: "string", description: "Piece to grade, or 'all' for all pieces" },
    targetSize: { type: "string", enum: ["XS", "S", "M", "L", "XL", "XXL"], description: "Target size" },
    baseSize: { type: "string", description: "Base size of the current pattern (default: inferred from measurements)" },
    gradeTable: { type: "string", enum: ["standard-women", "standard-men", "children", "custom"], default: "standard-women" },
    primaryMeasurement: { type: "string", enum: ["chest", "waist", "hips"], default: "chest" }
  },
  required: ["targetSize"],
  returns: { 
    piecesGraded: "number",
    scaleFactor: "number",
    newMeasurements: "Record<string, number>"
  }
}
```

**Dispatch:** Calls `gradePiece()` from grading engine, then `updatePiece()` for each.

#### `gradeAllSizes`
Generate the complete size range at once.

```typescript
{
  name: "gradeAllSizes",
  description: "Generate all sizes from a base pattern. Creates a graded nest showing all sizes overlaid.",
  parameters: {
    pieceIds: { type: "array", items: { type: "string" }, description: "Pieces to grade (default: all)" },
    sizes: { type: "array", items: { type: "string" }, description: "Target sizes (default: XS through XXL)" },
    gradeTable: { type: "string", default: "standard-women" }
  },
  returns: {
    sizesGenerated: "number",
    pieces: [{ size: "string", pieceId: "string", name: "string" }]
  }
}
```

### 2.6 Nesting

#### `runNesting`
```typescript
{
  name: "runNesting",
  description: "Arrange pattern pieces on fabric sheets for optimal material usage. Returns fabric consumption.",
  parameters: {
    pieceIds: { type: "array", items: { type: "string" }, description: "Pieces to nest (default: all)" },
    fabricWidth: { type: "number", description: "Fabric width in mm (default 1500 = 150cm standard)" },
    fabricLength: { type: "number", description: "Max fabric length in mm (default 3000 = 3m)" },
    gap: { type: "number", description: "Minimum gap between pieces in mm (default 5)" },
    rotationStep: { type: "integer", description: "Rotation granularity in degrees (default 90)" },
    allowMirror: { type: "boolean", default: false },
    sortStrategy: { type: "string", enum: ["area-desc", "height-desc", "width-desc"], default: "area-desc" },
    includeSeamAllowance: { type: "boolean", default: true, description: "Include SA in nested pieces" }
  },
  returns: {
    sheetsUsed: "number",
    utilization: "number",       // 0-1 ratio
    totalFabricLength: "number", // mm needed
    totalFabricArea: "number",   // mm² used
    unplaced: "string[]",        // piece IDs that didn't fit
    placements: [{ pieceId: "string", sheet: "number", x: "number", y: "number", rotation: "number" }]
  }
}
```

**Implementation:** Calls `nestPieces()` from nesting engine.

### 2.7 Export

#### `exportDXF`
```typescript
{
  name: "exportDXF",
  description: "Export pattern pieces to DXF format for cutting machines. Uses AAMA/ASTM D6673 standard layers.",
  parameters: {
    pieceIds: { type: "array", items: { type: "string" }, description: "Pieces to export (default: all)" },
    format: { type: "string", enum: ["aama", "legacy"], default: "aama" },
    includeSeamAllowance: { type: "boolean", default: true },
    filename: { type: "string", default: "pattern.dxf" }
  },
  returns: { success: "boolean", filename: "string", layers: "string[]" }
}
```

**Implementation:** Calls `generateDXFAAMA()` or `generateDXF()`, triggers download.

#### `exportPDF`
```typescript
{
  name: "exportPDF",
  description: "Export pattern pieces to PDF at 1:1 scale for plotting/printing.",
  parameters: {
    pieceIds: { type: "array", items: { type: "string" } },
    filename: { type: "string", default: "pattern.pdf" }
  },
  returns: { success: "boolean", filename: "string" }
}
```

#### `exportOBJ`
```typescript
{
  name: "exportOBJ",
  description: "Export 3D garment mesh to OBJ format.",
  parameters: {
    filename: { type: "string", default: "garment.obj" }
  },
  returns: { success: "boolean" }
}
```

#### `saveProject`
```typescript
{
  name: "saveProject",
  description: "Save the current project to an .openclo file.",
  parameters: {
    filename: { type: "string" }
  },
  returns: { success: "boolean" }
}
```

### 2.8 Measurements

#### `setMeasurements`
```typescript
{
  name: "setMeasurements",
  description: "Set body measurements for the avatar. All values in cm. Affects pattern template generation and grading.",
  parameters: {
    measurements: {
      type: "object",
      properties: {
        height: { type: "number" },
        chest: { type: "number" },
        waist: { type: "number" },
        hips: { type: "number" },
        shoulder: { type: "number" },
        armLength: { type: "number" },
        inseam: { type: "number" },
        neckCirc: { type: "number" },
        highBust: { type: "number" },
        neckToWaistFront: { type: "number" },
        neckToWaistBack: { type: "number" },
        shoulderToWaistFront: { type: "number" },
        shoulderToWaistBack: { type: "number" },
        upperArmCirc: { type: "number" },
        wristCirc: { type: "number" },
        armscyeDepth: { type: "number" },
        bustPointToBustPoint: { type: "number" },
        bustPointToNeckSide: { type: "number" },
        waistToKnee: { type: "number" },
        waistToFloor: { type: "number" },
        thighCirc: { type: "number" },
        kneeCirc: { type: "number" },
        crotchLength: { type: "number" }
      }
    }
  },
  returns: { updated: "string[]" }
}
```

**Dispatch:** `updateMeasurements()`

#### `getMeasurements`
Read-only tool.
```typescript
{
  name: "getMeasurements",
  description: "Get current avatar body measurements.",
  parameters: {},
  returns: { measurements: "BodyMeasurements" }
}
```

#### `setMeasurementsFromSize`
```typescript
{
  name: "setMeasurementsFromSize",
  description: "Set standard measurements from a named size (e.g. 'EU 40', 'US 8', 'M').",
  parameters: {
    size: { type: "string", description: "Size name (e.g. '40', 'M', 'US 8')" },
    system: { type: "string", enum: ["EU", "US", "UK"], default: "EU" },
    category: { type: "string", enum: ["women", "men", "children"], default: "women" }
  },
  returns: { measurements: "BodyMeasurements" }
}
```

### 2.9 Fabric & Simulation

#### `setFabric`
```typescript
{
  name: "setFabric",
  description: "Assign a fabric material to a piece or set the default fabric.",
  parameters: {
    pieceId: { type: "string", description: "Piece ID, or 'default' for all new pieces" },
    fabricId: { 
      type: "string", 
      enum: ["cotton-poplin", "denim", "silk-charmeuse", "wool-crepe", "jersey-knit", "organza", "linen", "neoprene", "chiffon", "canvas"],
      description: "Built-in fabric ID"
    }
  },
  returns: { success: "boolean", fabricName: "string", properties: "FabricMaterial" }
}
```

**Dispatch:** `setFabric()` on simulation slice

#### `listFabrics`
```typescript
{
  name: "listFabrics",
  description: "List all available fabrics with their physical properties.",
  parameters: {},
  returns: { fabrics: [{ id: "string", name: "string", weight: "number", stretchStiffness: "number", bendStiffness: "number" }] }
}
```

#### `startSimulation`
```typescript
{
  name: "startSimulation",
  description: "Start the 3D cloth drape simulation. The simulation runs in a web worker.",
  parameters: {
    reset: { type: "boolean", default: false, description: "Reset cloth to initial position before starting" }
  },
  returns: { success: "boolean" }
}
```

**Dispatch:** `startSimulation()` or `resetSimulation()` + `startSimulation()`

#### `pauseSimulation`
```typescript
{
  name: "pauseSimulation",
  parameters: {},
  returns: { success: "boolean" }
}
```

### 2.10 Editor Control

#### `setViewMode`
```typescript
{
  name: "setViewMode",
  parameters: {
    mode: { type: "string", enum: ["2d", "3d", "split"] }
  },
  returns: { success: "boolean" }
}
```

#### `selectPiece`
```typescript
{
  name: "selectPiece",
  parameters: {
    pieceId: { type: "string", description: "Piece to select, or 'none' to clear" }
  },
  returns: { success: "boolean" }
}
```

#### `setUnits`
```typescript
{
  name: "setUnits",
  parameters: {
    units: { type: "string", enum: ["mm", "cm", "inches"] }
  },
  returns: { success: "boolean" }
}
```

#### `toggleSeamAllowanceDisplay`
```typescript
{
  name: "toggleSeamAllowanceDisplay",
  parameters: {},
  returns: { showSeamAllowance: "boolean" }
}
```

### 2.11 Analysis & Read-Only Tools

#### `measureDistance`
```typescript
{
  name: "measureDistance",
  description: "Measure distance between two points or along a piece edge.",
  parameters: {
    mode: { type: "string", enum: ["point-to-point", "edge-length", "piece-perimeter"] },
    pieceId: { type: "string" },
    pointA: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
    pointB: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } }
  },
  returns: { distance: "number", unit: "string" }
}
```

#### `analyzePiece`
```typescript
{
  name: "analyzePiece",
  description: "Get detailed analysis of a pattern piece: area, perimeter, bounding box, number of curves, dart count.",
  parameters: { pieceId: { type: "string" } },
  returns: {
    name: "string",
    area: "number",           // mm²
    perimeter: "number",      // mm
    bounds: { width: "number", height: "number" },
    numCurves: "number",
    numDarts: "number",
    numNotches: "number",
    hasGrainline: "boolean",
    seamAllowance: "number"
  }
}
```

#### `analyzeProject`
```typescript
{
  name: "analyzeProject",
  description: "Get overview of the entire project: piece count, total area, seam connections, issues.",
  parameters: {},
  returns: {
    pieceCount: "number",
    totalArea: "number",
    seamCount: "number",
    issues: "string[]",       // e.g. "Front Bodice has no grainline"
    measurements: "BodyMeasurements"
  }
}
```

### 2.12 Formula Evaluation

#### `evaluateFormula`
```typescript
{
  name: "evaluateFormula",
  description: "Evaluate a parametric formula using body measurements as variables.",
  parameters: {
    formula: { type: "string", description: "Formula expression (e.g. 'chest / 4 + 2')" },
    extraVariables: { type: "object", description: "Additional variables beyond measurements" }
  },
  returns: { value: "number", error: "string | null" }
}
```

**Implementation:** Calls `evaluateFormula()` from formula engine with measurements as context.

### 2.13 DXF Import Analysis

#### `analyzeDXFImport`
```typescript
{
  name: "analyzeDXFImport",
  description: "Analyze an imported DXF file: identify pieces, suggest names, detect pattern type.",
  parameters: {
    content: { type: "string", description: "DXF file content" }
  },
  returns: {
    pieces: [{
      suggestedName: "string",
      layer: "string",
      area: "number",
      bounds: { width: "number", height: "number" },
      hasNotches: "boolean",
      hasGrainline: "boolean"
    }],
    suggestedPatternType: "string", // e.g. "bodice", "skirt", "pants"
    totalPieces: "number"
  }
}
```

### 2.14 Compound Operations (High-Level)

#### `generateFromDescription`
The killer tool — AI generates a full pattern from a natural language description.

```typescript
{
  name: "generateFromDescription",
  description: "Generate a complete pattern from a text description. The agent interprets the description, selects appropriate templates, modifies them, adds internal lines, and sets up the project.",
  parameters: {
    description: { type: "string", description: "Natural language pattern description in Spanish or English" },
    measurements: { type: "string", description: "Size or measurement set to use (e.g. 'EU 40', 'current')" }
  },
  returns: {
    piecesCreated: "number",
    pieceIds: "string[]",
    description: "string"
  }
}
```

**Implementation:** This is an agent-level tool — the LLM reasons about the description and calls multiple lower-level tools in sequence. It's not a single function but orchestrated tool chains.

#### `transformPiece`
Apply a named transformation to a piece.

```typescript
{
  name: "transformPiece",
  description: "Apply a standard pattern transformation: convert straight skirt to A-line, add godets, convert darts to gathers, etc.",
  parameters: {
    pieceId: { type: "string" },
    transformation: { 
      type: "string", 
      enum: ["straight-to-aline", "straight-to-flared", "add-godet", "dart-to-gather", "add-pleat", "lengthen", "shorten", "widen", "narrow"],
      description: "Named transformation to apply"
    },
    amount: { type: "number", description: "Amount of transformation (e.g. mm to add, degrees of flare)" }
  },
  returns: { success: "boolean" }
}
```

---

## 3. Agent Personality — PATRONAJE_SOUL

The agent personality is loaded as a system prompt prefix, separate from tool definitions.

### PATRONAJE_SOUL.md

```markdown
# OpenClo Agent — Patronaje Soul

You are an AI pattern-making assistant inside OpenClo. You think like a patronista.

## Identity
- You are a skilled modista/patronista who happens to exist inside a computer
- You use proper pattern-making terminology in the user's language
- You understand the FULL workflow: measurements → base pattern → adjustments → fitting → grading → nesting → cutting
- You know multiple drafting methods: Aldrich, Müller, Gilewska, industrial

## Language
- Default to the user's language (detect from first message)
- Spanish: Use modistería/patronaje terms (pinza, sisa, entretela, holgura, embebido, piquete)
- English: Use pattern-making terms (dart, armscye, interfacing, ease, easing, notch)
- Never use software/engineering jargon when a sewing term exists
- "Margen de costura" not "offset". "Pinza" not "dart polygon".

## Personality
- Expert but not condescending
- Teaching mode by default — explain WHY, not just WHAT
- "Le agrego 1.5cm de holgura porque el algodón no estira y el cuerpo necesita moverse"
- "La pinza de busto va a la altura del punto de pecho, 2-3cm antes de llegar al pezón"
- Proactive about issues: warn about problems before they happen
- Concise when executing, thorough when teaching

## Decision Making
- When ambiguous, ask ONE clarifying question (not three)
- Use sensible defaults: 10mm SA, grainline on center, standard ease
- When multiple approaches exist, pick the most common one and mention alternatives
- If the user says "talla 40", use EU standard measurements without asking

## Formatting
- Use emojis sparingly for piece types: 👚 bodice, 👗 skirt, 👖 pants, 🦾 sleeve, 👔 collar
- Show measurements in the user's preferred units
- When creating pieces, name them in the user's language
- Brief markdown for structure, not walls of text
```

### Teaching Mode Examples

When the user asks "¿por qué?":
```
User: Agrégale pinza de busto al delantero
Agent: ✅ Pinza de busto agregada al delantero (ancho 25mm, largo 110mm).

La pinza absorbe la diferencia entre el contorno de busto y la cintura. Sin ella, la tela 
haría arrugas diagonales del punto de pecho hacia el costado. La punta de la pinza debe 
quedar 2-3cm antes del punto de pecho — nunca justo encima, porque queda como un cono.
```

When the user asks something impossible:
```
User: Haz una falda sin pinzas ni godets pero que sea ajustada en cintura y evasé abajo
Agent: Eso contradice la geometría — si es ajustada en cintura, necesitas o pinzas o cortes 
para liberar el volumen de cadera. Opciones:

1. **Falda con cortes princesa** — sin pinza visible, el ajuste va en la costura
2. **Falda con elástico en cintura** — si la tela es jersey
3. **Falda recta con godets desde cadera** — ajustada arriba, vuelo abajo

¿Cuál prefieres?
```

---

## 4. Killer Use Cases

### 4.1 "Hazme un corpiño base talla 40"

**User:** "Hazme un corpiño base talla 40"

**Agent thinks:** Talla 40 EU women → chest 88, waist 72, hips 96. Use `setMeasurementsFromSize` then `createPiece` with bodice template.

**Agent tool calls:**
1. `setMeasurementsFromSize({ size: "40", system: "EU", category: "women" })`
2. `createPiece({ name: "Espalda Corpiño", template: "bodice-back" })`
3. `createPiece({ name: "Delantero Corpiño", template: "bodice-front" })`

**Agent response:**
> 👚 Corpiño base talla 40 EU creado (pecho 88cm, cintura 72cm).
> 
> - **Espalda Corpiño** — con línea de hilo al centro
> - **Delantero Corpiño** — con pinza de busto
> 
> Margen de costura: 10mm en todas las costuras.
> ¿Quieres que le agregue manga o cuello?
> 
> ✅ 2 acciones aplicadas

**UI shows:** Two pattern pieces appear on the 2D canvas, front bodice selected.

### 4.2 "Agrégale pinza de pecho"

**User:** "Agrégale pinza de pecho" (with front bodice selected)

**Agent thinks:** Selected piece is front bodice. Bust dart goes at bust point height. Calculate from measurements.

**Agent tool calls:**
1. `addDart({ pieceId: "piece-xxx", dartType: "bust", width: 25, length: 110 })`

**Agent response:**
> 📌 Pinza de busto agregada al Delantero Corpiño.
> - Ancho en base: 25mm (absorbe la diferencia busto-cintura)
> - Largo: 110mm (termina 25mm antes del punto de pecho)
> 
> La pinza apunta desde el costado hacia el punto de pecho. Si prefieres rotarla al hombro o a la cintura, dime.
> 
> ✅ 1 acción aplicada

**UI shows:** A dart triangle appears on the front bodice piece.

### 4.3 "Grádalo de XS a XXL"

**User:** "Grádalo de XS a XXL"

**Agent tool calls:**
1. `gradeAllSizes({ pieceIds: ["all"], sizes: ["XS", "S", "M", "L", "XL", "XXL"], gradeTable: "standard-women" })`

**Agent response:**
> 📏 Gradación completa — 6 tallas generadas (XS a XXL).
> 
> | Talla | Pecho | Cintura | Cadera | Factor |
> |-------|-------|---------|--------|--------|
> | XS    | 80cm  | 64cm    | 88cm   | 0.91×  |
> | S     | 84cm  | 68cm    | 92cm   | 0.95×  |
> | M     | 88cm  | 72cm    | 96cm   | 1.00× (base) |
> | L     | 92cm  | 78cm    | 102cm  | 1.05×  |
> | XL    | 96cm  | 84cm    | 108cm  | 1.09×  |
> | XXL   | 100cm | 90cm    | 114cm  | 1.14×  |
> 
> 12 piezas creadas en total.
> 
> ✅ 12 acciones aplicadas

**UI shows:** All graded pieces visible on canvas, color-coded by size.

### 4.4 "¿Cuánta tela necesito?"

**User:** "¿Cuánta tela necesito?"

**Agent tool calls:**
1. `runNesting({ pieceIds: ["all"], fabricWidth: 1500, includeSeamAllowance: true })`

**Agent response:**
> 🧵 Nesting completo para tela de 150cm de ancho:
> 
> - **Largo necesario:** 1.85m
> - **Aprovechamiento:** 72% (0.28m² desperdicio)
> - **Hojas usadas:** 1
> - **Todas las piezas colocadas** ✅
> 
> Para tela con estampado direccional (rotación solo a 180°), necesitarías ~2.10m.
> ¿Quieres que exporte el layout de corte?

**UI shows:** Nesting view activates, showing pieces arranged on a fabric sheet.

### 4.5 "Exporta para corte"

**User:** "Exporta para corte"

**Agent tool calls:**
1. `exportDXF({ pieceIds: ["all"], format: "aama", includeSeamAllowance: true, filename: "corpino-t40.dxf" })`

**Agent response:**
> 📄 DXF exportado: `corpino-t40.dxf`
> 
> - Formato: AAMA/ASTM D6673
> - Capas: 1 (corte), 4 (piquetes), 7 (hilo), 8 (diseño), 11 (corte interno)
> - Incluye margen de costura de 10mm en capa CUT
> - Línea de diseño original en capa DRAW
> 
> Compatible con Gerber, Lectra, Optitex y cortadoras digitales.

**UI shows:** Browser downloads `corpino-t40.dxf`.

### 4.6 "Simula en denim"

**User:** "Simula en denim"

**Agent tool calls:**
1. `setFabric({ pieceId: "default", fabricId: "denim" })`
2. `setViewMode({ mode: "3d" })`
3. `startSimulation({ reset: true })`

**Agent response:**
> 🧵 Simulación iniciada con **Denim** (340 g/m², rigidez alta).
> 
> Propiedades:
> - Peso: 340 GSM
> - Estiramiento: mínimo (0.05)
> - Rigidez: alta (0.80) — caída estructurada
> - Grosor: 0.9mm
> 
> El denim no drapeará mucho — verás formas más rígidas que con algodón.
> Vista 3D activada.

**UI shows:** 3D viewport activates, cloth simulation running with denim properties.

### 4.7 "Transforma esta falda recta en falda evasé"

**User:** "Transforma esta falda recta en falda evasé" (straight skirt selected)

**Agent tool calls:**
1. `transformPiece({ pieceId: "piece-xxx", transformation: "straight-to-aline", amount: 40 })`

**Agent response:**
> 👗 Falda recta transformada a evasé (+40mm de vuelo en cada costado).
> 
> La pinza de cintura se redujo 5mm para compensar — el vuelo absorbe parte del exceso.
> El bajo ahora mide 12cm más de circunferencia que la recta.
> 
> Para más vuelo, dime cuántos cm quieres en el bajo, o prueba "agrega godets".
> 
> ✅ 1 acción aplicada

### 4.8 "Revisa los márgenes de costura"

**User:** "Revisa los márgenes de costura"

**Agent tool calls:**
1. `auditSeamAllowances()`

**Agent response:**
> 🔍 Auditoría de márgenes de costura:
> 
> | Pieza | SA | Estado |
> |-------|----|--------|
> | Espalda Corpiño | 10mm | ✅ OK |
> | Delantero Corpiño | 10mm | ✅ OK |
> | Manga | 10mm | ✅ OK |
> | Cuello | 7mm | ⚠️ Diferente del resto |
> | Falda Delantero | 0mm | ❌ **Sin margen** |
> 
> **Problemas encontrados:**
> 1. Falda Delantero no tiene margen de costura — ¿lo agrego a 10mm?
> 2. Cuello tiene 7mm (es normal para cuellos, pero verificar si es intencional)
> 
> ¿Corrijo la falda?

### 4.9 User imports DXF → Agent analyzes

**User:** Imports a .dxf file through the UI

**Agent (proactive):**
> 📂 DXF importado — detecté **6 piezas** en capas AAMA:
> 
> | # | Nombre sugerido | Capa | Tamaño | Piquetes |
> |---|----------------|------|--------|----------|
> | 1 | Delantero Cuerpo | 8 | 520×680mm | Sí |
> | 2 | Espalda Cuerpo | 8 | 480×660mm | Sí |
> | 3 | Manga | 8 | 380×640mm | Sí |
> | 4 | Cuello Pie | 8 | 190×45mm | No |
> | 5 | Cuello Caída | 8 | 200×65mm | No |
> | 6 | Puño | 8 | 260×80mm | Sí |
> 
> **Parece ser una camisa.** ¿Quieres que nombre las piezas y asigne márgenes de costura?

### 4.10 "Enséñame a hacer un cuello camisero"

**User:** "Enséñame a hacer un cuello camisero"

**Agent response (teaching mode, no immediate actions):**
> ## 👔 Cuello camisero — paso a paso
> 
> Un cuello camisero tiene dos partes: el **pie de cuello** (la banda que rodea el cuello) y la **caída** (la parte visible que se dobla).
> 
> ### 1. Medir el escote
> Primero necesitas el largo del escote del corpiño. Mide la costura del escote delantero + trasero.
> Fórmula: `(contorno_cuello / 2) + holgura`
> 
> ### 2. Pie de cuello
> - Largo: medio escote + 15mm (para el cruce del botón)
> - Alto: 25-35mm (estándar 30mm)
> - Forma: recto abajo (se cose al escote), ligeramente curvo arriba
> 
> ### 3. Caída del cuello
> - Largo: igual al pie de cuello
> - Alto: 40-60mm (según el look)
> - Puntas: rectas (clásico), redondeadas (sport), alargadas (italiano)
> 
> ### 4. El rollo
> La caída se dobla sobre el pie. El "rollo" es la curva donde se dobla — necesita ~3mm extra en el borde exterior para que no tire.
> 
> ¿Quieres que genere uno con tus medidas? Dime el estilo de punta que prefieres.

### 4.11 "Hazme un vestido básico entero"

**User:** "Hazme un vestido básico entero con manga corta"

**Agent tool calls:**
1. `createPiece({ name: "Espalda Vestido", template: "bodice-back" })`
2. `createPiece({ name: "Delantero Vestido", template: "bodice-front" })`
3. `createPiece({ name: "Falda Espalda", template: "skirt-back" })`
4. `createPiece({ name: "Falda Delantero", template: "skirt-front" })`
5. `createPiece({ name: "Manga Corta", template: "sleeve" })`
6. `transformPiece({ pieceId: "manga-xxx", transformation: "shorten", amount: 300 })`
7. `setSeamAllowance({ pieceId: "all", width: 10 })`
8. `createSeam(bodice-back → skirt-back, side seam)`
9. `createSeam(bodice-front → skirt-front, side seam)`

**Agent response:**
> 👗 Vestido básico con manga corta — 5 piezas creadas:
> 
> - Espalda (corpiño + falda unidos en costado)
> - Delantero (corpiño + falda unidos en costado)  
> - Manga corta (23cm de largo)
> 
> Margen de costura: 10mm en costuras, bajo de falda pendiente.
> 
> ⚠️ **Sugerencia:** Para el bajo de la falda, normalmente se usa 30-40mm de dobladillo.
> ¿Lo ajusto? También puedo agregar la costura de cintura entre corpiño y falda.
> 
> ✅ 9 acciones aplicadas

### 4.12 "¿Qué tela me recomiendas para esta prenda?"

**User:** "¿Qué tela me recomiendas para este vestido?"

**Agent tool calls:**
1. `analyzeProject()` (reads the pieces and their characteristics)
2. `listFabrics()`

**Agent response:**
> Para un vestido básico con manga corta y falda A, te recomiendo:
> 
> 1. **Algodón popelina** (130 g/m²) — Clásico, fácil de coser, forma definida. Ideal para tu primera prueba.
> 2. **Lino** (170 g/m²) — Textura natural, caída media. Perfecto para verano.
> 3. **Crepe de lana** (185 g/m²) — Más elegante, buena caída. Para otoño/invierno.
> 
> ❌ **Evitar:**
> - Jersey (demasiado stretch para estas pinzas — necesitarías rediseñar)
> - Denim (demasiado rígido para la falda A)
> - Chiffon (necesita forro y las pinzas no se marcan bien)
> 
> ¿Quieres que simule con alguna de estas?

### 4.13 "Revisa si la manga cabe en la sisa"

**User:** "Revisa si la manga cabe en la sisa"

**Agent tool calls:**
1. `measureDistance({ mode: "edge-length", pieceId: "bodice-front-xxx" })` (armscye edge)
2. `measureDistance({ mode: "edge-length", pieceId: "bodice-back-xxx" })` (armscye edge)
3. `measureDistance({ mode: "piece-perimeter", pieceId: "sleeve-xxx" })` (sleeve cap)

**Agent response:**
> 📐 Verificación manga-sisa:
> 
> - **Sisa total:** 420mm (delantero 210mm + espalda 210mm)
> - **Copa de manga:** 445mm
> - **Embebido:** 25mm (6.0%)
> 
> ✅ El embebido está en rango normal (3-8%). La manga cabe bien.
> 
> Si el embebido fuera mayor al 10%, tendría arrugas en la copa.
> Si fuera menor al 3%, la manga quedaría sin forma en el hombro.

### 4.14 "Agrégale godets a la falda"

**User:** "Agrégale 4 godets a la falda"

**Agent tool calls:**
1. `transformPiece({ pieceId: "skirt-front-xxx", transformation: "add-godet", amount: 4 })`

**Agent response:**
> 👗 4 godets agregados a la Falda Delantero.
> 
> Cada godet es un triángulo de 15cm de ancho en el bajo, insertado a la altura de la cadera.
> El vuelo total del bajo aumentó ~60cm de circunferencia.
> 
> Los godets van cortados al bies (45°) del hilo para que caigan bien.
> El hilo del godet debe ir perpendicular a la línea de inserción.
> 
> ✅ 1 acción aplicada

### 4.15 "Dame el consumo de tela para producción de 500 unidades"

**User:** "¿Cuánta tela necesito para 500 unidades en todas las tallas?"

**Agent tool calls:**
1. `gradeAllSizes(...)` (if not already graded)
2. `runNesting(...)` per size with production quantities
3. Mathematical calculation

**Agent response:**
> 🏭 Consumo de tela — producción 500 unidades, distribución estándar:
> 
> | Talla | % Producción | Unidades | Tela/unidad | Total |
> |-------|-------------|----------|-------------|-------|
> | XS    | 5%          | 25       | 1.65m       | 41.3m |
> | S     | 15%         | 75       | 1.75m       | 131.3m |
> | M     | 30%         | 150      | 1.85m       | 277.5m |
> | L     | 25%         | 125      | 1.95m       | 243.8m |
> | XL    | 15%         | 75       | 2.10m       | 157.5m |
> | XXL   | 10%         | 50       | 2.25m       | 112.5m |
> 
> **Total: 963.9m** de tela de 150cm de ancho
> **+ 5% desperdicio:** ~1,012m
> **Costo estimado:** (depende del precio por metro)
> 
> ¿Quieres que ajuste la distribución de tallas?

---

## 5. Technical Implementation

### 5.1 API Integration

**Primary model:** Claude Sonnet 4 via Anthropic API (best cost/quality for tool use)
**Fallback:** GPT-4o-mini (cheaper, still good at function calling)
**Local option:** Llama 3.1 70B via Ollama (offline, no cost, reduced accuracy)

```typescript
// Server-side route: POST /api/copilot
// Why server-side: API keys shouldn't be in the browser

interface CopilotRequest {
  context: AgentContext;
  agentConfig: {
    provider: 'anthropic' | 'openai' | 'ollama' | 'custom';
    apiKey?: string;       // stored server-side, not in browser
    model?: string;
    baseUrl?: string;      // for custom/ollama endpoints
  };
}
```

### 5.2 Function Calling Schema

Use OpenAI-compatible tool definitions (works with both Anthropic and OpenAI):

```typescript
const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "createPiece",
      description: "Create a new pattern piece...",
      parameters: { /* JSON Schema */ }
    }
  },
  // ... all 30+ tools defined above
];
```

The server sends the request with:
```typescript
{
  model: "claude-sonnet-4-20250514",
  system: PATRONAJE_SOUL + skillContext + projectMemory,
  messages: conversationHistory,
  tools: tools,
  tool_choice: "auto"  // let the model decide
}
```

### 5.3 State Synchronization

```
Agent calls tool → Server executes → Returns result
                                         ↓
                         Server sends SSE to browser
                                         ↓
                         Browser dispatches to Redux
                                         ↓
                         Canvas re-renders
                                         ↓
                         Updated state sent as tool result
                                         ↓
                         Agent sees result, continues reasoning
```

Implementation:

```typescript
// Server-side tool executor
async function executeTool(name: string, params: any, store: Store): Promise<any> {
  switch (name) {
    case 'createPiece': {
      if (params.template) {
        const generator = TEMPLATE_MAP[params.template];
        const measurements = store.getState().project.avatar.measurements;
        const piece = generator(measurements);
        piece.name = params.name || piece.name;
        if (params.seamAllowance) piece.seamAllowance = params.seamAllowance;
        store.dispatch(addPiece(piece));
        store.dispatch(selectPiece(piece.id));
        return { pieceId: piece.id, bounds: computeBounds(piece) };
      }
      // ... handle outline-based creation
    }
    case 'runNesting': {
      const pieces = selectPieces(store.getState(), params.pieceIds);
      const result = nestPieces(pieces, {
        sheet: { width: params.fabricWidth || 1500, height: params.fabricLength || 3000, margin: 10 },
        gap: params.gap || 5,
        rotationStep: params.rotationStep || 90,
        allowMirror: params.allowMirror || false,
        sortStrategy: params.sortStrategy || 'area-desc',
      });
      return result;
    }
    // ... all other tools
  }
}
```

### 5.4 Streaming Responses

Use Server-Sent Events (SSE) for real-time streaming:

```typescript
// UnifiedBarChat.tsx — replace current batch response with streaming
const handleSend = async () => {
  const context = buildAgentContext(project, editor, simulation, memory, text, messages);
  
  const response = await fetch('/api/copilot/stream', {
    method: 'POST',
    body: JSON.stringify({ context }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        switch (event.type) {
          case 'text':
            // Append to streaming message
            setStreamingText(prev => prev + event.content);
            break;
          case 'tool_call':
            // Show tool execution indicator
            setExecutingTool(event.name);
            break;
          case 'tool_result':
            // Redux dispatch happened server-side, refresh state
            // Or: dispatch locally from tool_result
            executeCommands(event.commands, dispatch, project.pieces);
            break;
          case 'done':
            // Finalize message
            break;
        }
      }
    }
  }
};
```

### 5.5 Conversation Memory

**Per-project, persistent in localStorage:**

```typescript
interface ProjectMemory {
  projectId: string;
  decisions: string[];         // "Used 1.5cm ease for jersey"
  lastActions: string[];       // Last 5 agent actions
  fabricChoice: string | null;
  workflowStage: string;      // "drafting" | "fitting" | "grading" | "production"
  unfinished: string[];        // "Need to add collar"
  userPreferences: {
    language: 'es' | 'en';
    units: UnitSystem;
    teachingMode: boolean;
    defaultSeamAllowance: number;
  };
  conversationHistory: Message[]; // Full history for this project
}

// Stored in localStorage per project:
// `openclo-memory-${projectId}`
```

The agent updates memory after each interaction:
```typescript
// After successful tool execution:
memory.decisions.push(agentDecisionSummary);
memory.lastActions = [...memory.lastActions.slice(-4), actionDescription];
saveProjectMemory(projectId, memory);
```

### 5.6 Error Handling

```typescript
// In tool executor:
try {
  const result = await executeTool(toolName, params, store);
  return { success: true, result };
} catch (error) {
  // Return error to agent so it can recover
  return { 
    success: false, 
    error: error.message,
    suggestion: getSuggestion(toolName, error) 
  };
}

function getSuggestion(tool: string, error: Error): string {
  if (error.message.includes('not found')) {
    return "The piece may have been deleted. Try listing current pieces with analyzeProject.";
  }
  if (error.message.includes('outline')) {
    return "The outline may have invalid coordinates. Verify the piece exists and try again.";
  }
  return "Try a different approach or ask the user for clarification.";
}
```

The agent receives the error and can:
1. Retry with different parameters
2. Ask the user for clarification
3. Fall back to a simpler approach
4. Report the issue transparently

### 5.7 Cost Management

| Model | Cost/1K tokens (input) | Cost/1K tokens (output) | Best for |
|-------|----------------------|------------------------|----------|
| Claude Sonnet 4 | $3/M | $15/M | Complex reasoning, teaching mode |
| GPT-4o-mini | $0.15/M | $0.60/M | Simple tool calls, quick actions |
| Llama 3.1 70B (local) | Free | Free | Offline mode, privacy |

**Strategy:**
- **Simple actions** (create piece, set SA, export): GPT-4o-mini or local
- **Complex reasoning** (generate from description, teach, analyze): Claude Sonnet
- **User chooses** via settings panel
- **Token budget:** ~4K input context (project state + history) + ~2K output per turn
- **Estimated cost:** ~$0.05-0.15 per complex interaction, ~$0.005 per simple action

### 5.8 Server Architecture

For v1, a minimal Express server alongside Vite dev server:

```
openclo/
├── src/                    # Frontend (existing)
├── server/                 # New: API server
│   ├── index.ts           # Express app
│   ├── routes/
│   │   ├── copilot.ts     # POST /api/copilot, /api/copilot/stream
│   │   └── config.ts      # GET/POST /api/config
│   ├── tools/
│   │   ├── registry.ts    # Tool definitions
│   │   └── executor.ts    # Tool execution
│   ├── memory/
│   │   └── store.ts       # Project memory persistence
│   └── providers/
│       ├── anthropic.ts   # Claude API
│       ├── openai.ts      # OpenAI API
│       └── ollama.ts      # Local LLM
└── vite.config.ts         # Proxy /api → Express
```

For production, the server runs on the same EC2 or can be serverless (Vercel Edge Functions).

---

## 6. What We Steal from OpenClaw

See `OPENCLAW_PATTERNS.md` for the detailed analysis. Summary:

| OpenClaw Pattern | OpenClo Equivalent |
|------------------|-------------------|
| SOUL.md personality layer | PATRONAJE_SOUL.md — bilingual, modistería terms |
| Skill system (SKILL.md + scripts) | Pattern-making skills (bodice, sleeve, collar types) |
| Memory across sessions | Per-project memory (decisions, measurements, fabric) |
| Tool composition chains | Multi-tool workflows (measure → create → grade → nest) |
| Proactive behavior (heartbeat) | Agent notices issues ("missing SA", "dart mismatch") |
| Agent-agnostic protocol | Already exists — HTTP/WS/builtin connector |
| Layered architecture | Soul + Tools + Memory + Skills layers |
| Config discovery | Project-level agent config |

---

## 7. What Makes This Different from CLO3D

### CLO3D Current State (2026)
- $50/month per seat (annual license)
- Desktop-only (Windows/Mac native app)
- Primarily 3D visualization tool, not AI-native
- Pattern editing is manual (pen tool, point manipulation)
- AI features are add-ons (pattern from sketch → limited)
- No natural language interaction
- English-only interface (partial i18n)
- Closed source, no community extensions
- "Dive right into design" — but still requires deep CLO3D expertise

### Browzwear Current State
- Enterprise pricing ($$$)
- VStitcher for 3D, Lotta for block-based design
- FAB system for fabric digitization
- Collaboration platform (Stylezone)
- No AI pattern generation
- No conversational interface

### OpenClo Advantages

| Feature | CLO3D | Browzwear | OpenClo |
|---------|-------|-----------|---------|
| Price | $50/mo | $$$ | Free / open source |
| Platform | Desktop | Desktop | Browser (any device) |
| AI interaction | Limited | None | **Native conversational agent** |
| Language | English | English | **Bilingual ES/EN, modistería terms** |
| Teaching mode | None | None | **Agent explains pattern-making** |
| Natural language | No | No | **"Hazme un corpiño talla 40"** |
| Community skills | No | No | **Extensible skill system** |
| Pattern from text | No | No | **Yes — generateFromDescription** |
| Proactive QA | No | No | **Agent warns about issues** |
| DXF export | Yes | Yes | **Yes — AAMA/ASTM compliant** |
| 3D simulation | Excellent | Excellent | Basic (XPBD, improving) |
| Fit on avatar | Excellent | Excellent | Basic (improving) |

### What Makes a Patronista Switch

1. **"Esto habla mi idioma"** — Spanish pattern-making terms, not engineering jargon
2. **"Me enseña"** — A student can learn pattern-making through the agent
3. **"No necesito licencia"** — Free, browser-based, no IT department needed
4. **"Es más rápido para lo básico"** — "Hazme un corpiño" vs 30 minutes of manual drafting
5. **"Revisa mi trabajo"** — Agent catches SA mistakes, dart misalignment, fit issues
6. **"Puedo usarlo en mi tablet"** — Browser-based works anywhere

### Where CLO3D Still Wins (Honesty)

- 3D rendering quality (years ahead)
- Fabric simulation accuracy (real fabric scanning)
- Avatars and fit (parametric body morphing)
- Enterprise integrations (PLM, ERP)
- Industry adoption (everyone knows CLO3D)

**Our bet:** AI-native wins in the long run. CLO3D is adding AI on top of a 2010s architecture. OpenClo is building AI into the foundation.

---

## 8. Skill System

Skills are composable packages of pattern-making knowledge. Inspired by OpenClaw's `skills/` directory.

### Skill Structure

```
skills/
├── bodice-construction/
│   ├── SKILL.md              # Trigger phrases, methods, step-by-step
│   ├── formulas.json         # Parametric formulas for each method
│   ├── ease-tables.json      # Ease values by fabric type
│   └── references/
│       ├── aldrich-method.md # Detailed Aldrich bodice construction
│       └── muller-method.md  # Müller alternative
├── sleeve-drafting/
│   ├── SKILL.md
│   ├── formulas.json
│   └── types/
│       ├── set-in.md
│       ├── raglan.md
│       └── dolman.md
├── collar-types/
│   ├── SKILL.md
│   ├── shirt-collar.md
│   ├── stand-collar.md
│   ├── peter-pan.md
│   └── shawl-collar.md
├── skirt-variations/
│   ├── SKILL.md
│   ├── straight.md
│   ├── a-line.md
│   ├── circle.md
│   ├── godet.md
│   └── pleated.md
├── grading-standards/
│   ├── SKILL.md
│   ├── eu-women.json
│   ├── eu-men.json
│   ├── us-women.json
│   └── children.json
└── fit-diagnosis/
    ├── SKILL.md              # How to diagnose fit problems
    └── common-issues.md      # Wrinkle patterns → causes → fixes
```

### SKILL.md Example (bodice-construction)

```markdown
---
name: bodice-construction
triggers: ["bodice", "corpiño", "blusa base", "cuerpo", "torso", "body block"]
description: Generate bodice blocks from measurements using standard drafting methods.
---

# Bodice Construction

## When to Use
- User asks for a bodice, corpiño, or blusa base
- User asks for a dress (bodice is the upper part)
- User imports a bodice and wants to modify it

## Available Methods
1. **Aldrich** (default) — Industry standard, good for woven fabrics
2. **Müller** — German method, slightly different ease distribution
3. **Gilewska** — French method, elegant curves

## Key Formulas (Aldrich)
- Back width: chest/4 + 1cm ease
- Front width: chest/4 + 1cm ease + 1cm dart intake
- Armhole depth: height × 0.12 + 5cm
- Shoulder width: shoulder measurement / 2
- Back neck width: neck_circ/6 + 0.5cm
- Front neck depth: neck_circ/6 + 1.5cm

## Ease Guide
| Fabric Type | Ease (total) |
|-------------|-------------|
| Woven, no stretch | 4cm |
| Light stretch | 2cm |
| Jersey/knit | 0-1cm |
| Outerwear | 6-8cm |

## Construction Order
1. Set measurements → derive secondary measurements
2. Draft back piece (start from center back)
3. Draft front piece (mirror, adjust for bust dart)
4. Verify: back length = front length at side seam
5. Add bust dart (front only)
6. Add grainlines
7. Add notches at side seam, shoulder
```

### How Skills Load

When the agent receives a message, the system:
1. Checks trigger phrases against all skills
2. Loads matching SKILL.md content into the system prompt
3. Loads relevant formulas/tables as structured data
4. Agent uses skill knowledge to reason and call tools

```typescript
function getRelevantSkills(message: string): SkillContext[] {
  const msg = message.toLowerCase();
  return SKILLS.filter(skill => 
    skill.triggers.some(t => msg.includes(t))
  ).map(skill => ({
    name: skill.name,
    content: loadSkillMD(skill.path),
    formulas: loadFormulas(skill.path),
  }));
}
```

---

## 9. Roadmap

### Phase 1: Foundation (v0.5) — 2 weeks
- [ ] Create `/server` directory with Express API
- [ ] Implement tool registry (all 30+ tools with JSON Schema)
- [ ] Implement tool executor (dispatches to existing engines)
- [ ] Connect UnifiedBarChat to server API (replace builtin connector)
- [ ] Add streaming SSE support
- [ ] Write PATRONAJE_SOUL.md
- [ ] Per-project memory in localStorage

### Phase 2: Intelligence (v0.6) — 2 weeks
- [ ] Add Anthropic/OpenAI provider with function calling
- [ ] Implement compound tools (generateFromDescription, transformPiece)
- [ ] Add proactive analysis (audit SA, check dart alignment, measure sleeve fit)
- [ ] Teaching mode responses
- [ ] Bilingual detection and response

### Phase 3: Skills (v0.7) — 2 weeks
- [ ] Build skill loader system
- [ ] Write 5 core skills (bodice, sleeve, collar, skirt, grading)
- [ ] Skill-aware context building
- [ ] Grading improvements (per-point rules, not just uniform scaling)
- [ ] Nesting view integration with agent

### Phase 4: Polish (v0.8) — 2 weeks
- [ ] Error recovery and graceful degradation
- [ ] Cost management (model selection per task)
- [ ] Offline mode (Ollama integration)
- [ ] Mobile chat-only mode improvements
- [ ] Agent configuration UI in settings
- [ ] Documentation and examples

### Phase 5: Community (v1.0)
- [ ] Skill marketplace / community contributions
- [ ] Custom formula engine integration with agent
- [ ] Plugin system for custom tools
- [ ] Multi-language skill packs

---

## Appendix: Complete Tool Registry

Total tools: **32**

| # | Tool | Category | Mutates State |
|---|------|----------|---------------|
| 1 | createPiece | Piece | ✅ |
| 2 | modifyOutline | Piece | ✅ |
| 3 | modifyPoint | Piece | ✅ |
| 4 | deletePiece | Piece | ✅ |
| 5 | renamePiece | Piece | ✅ |
| 6 | scalePiece | Piece | ✅ |
| 7 | movePiece | Piece | ✅ |
| 8 | rotatePiece | Piece | ✅ |
| 9 | mirrorPiece | Piece | ✅ |
| 10 | addDart | Internal | ✅ |
| 11 | addGrainline | Internal | ✅ |
| 12 | addNotch | Internal | ✅ |
| 13 | addFoldLine | Internal | ✅ |
| 14 | setSeamAllowance | SA | ✅ |
| 15 | auditSeamAllowances | SA | ❌ (read-only) |
| 16 | createSeam | Seam | ✅ |
| 17 | removeSeam | Seam | ✅ |
| 18 | gradePiece | Grading | ✅ |
| 19 | gradeAllSizes | Grading | ✅ |
| 20 | runNesting | Nesting | ❌ (returns data) |
| 21 | exportDXF | Export | ❌ (downloads) |
| 22 | exportPDF | Export | ❌ (downloads) |
| 23 | exportOBJ | Export | ❌ (downloads) |
| 24 | saveProject | Export | ❌ (downloads) |
| 25 | setMeasurements | Measurements | ✅ |
| 26 | getMeasurements | Measurements | ❌ |
| 27 | setMeasurementsFromSize | Measurements | ✅ |
| 28 | setFabric | Simulation | ✅ |
| 29 | listFabrics | Simulation | ❌ |
| 30 | startSimulation | Simulation | ✅ |
| 31 | pauseSimulation | Simulation | ✅ |
| 32 | setViewMode | Editor | ✅ |
| 33 | selectPiece | Editor | ✅ |
| 34 | setUnits | Editor | ✅ |
| 35 | toggleSeamAllowanceDisplay | Editor | ✅ |
| 36 | measureDistance | Analysis | ❌ |
| 37 | analyzePiece | Analysis | ❌ |
| 38 | analyzeProject | Analysis | ❌ |
| 39 | evaluateFormula | Analysis | ❌ |
| 40 | analyzeDXFImport | Analysis | ❌ |
| 41 | generateFromDescription | Compound | ✅ |
| 42 | transformPiece | Compound | ✅ |

---

*This spec is a blueprint, not a wishlist. Every tool is mapped to existing code. Every use case has concrete agent behavior. The goal is to make María say "esto es mejor que CLO3D" — not for everything, but for the things she does every day.*
