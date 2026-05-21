# OpenClo Tool Audit Report — 232 Tools Across 46 Files

> **Date:** 2026-04-10
> **Purpose:** Determine which of the 232 copilot tools should be user-accessible via ⌘K command palette vs AI-only.

## Executive Summary

| Category | Count | % | Description |
|----------|-------|---|-------------|
| **MUST HAVE in ⌘K** | 16 | 6.9% | High-frequency daily operations — load, export, simulate, undo |
| **SHOULD HAVE in ⌘K** | 38 | 16.4% | Occasional operations with direct benefit — seams, fabric, grading, toggles |
| **AI-ONLY** | 178 | 76.7% | Complex multi-param ops where AI adds value — semantic adjustments, analysis, orchestration |
| **INTERNAL** | 0 | 0% | No tools are purely internal — all serve user-facing functions |

**Current state:** 25 commands in ⌘K. **Recommended:** 54 commands (16 must + 38 should).

---

## MUST HAVE in ⌘K (16 tools)
*These are blocking — users cannot work without them.*

| Tool | File | Why |
|------|------|-----|
| `loadSeamlyPattern` | seamlyTools | Load templates — core workflow entry |
| `listSeamlyPatterns` | seamlyTools | Browse available patterns |
| `startSimulation` | simulationTools | Start cloth sim — used constantly |
| `pauseSimulation` | simulationTools | Pause sim — essential control |
| `dressAvatar` | 3dInteractionTools | Auto-place pieces and simulate |
| `exportDXF` | exportTools | Standard manufacturing export |
| `exportPDF` | exportTools | Spec sheet export |
| `saveProject` | exportTools | Save work — critical |
| `selectPiece` | editorTools | Navigation — select piece by name |
| `setViewMode` | editorTools | Switch 2D/3D/Split |
| `undo` / `redo` | editorSlice | Navigation — already in TopBar |
| `createPiece` | pieceTools | Fundamental creation |
| `deletePiece` | pieceTools | Cleanup |
| `setFabric` | simulationTools | Assign material — users explore fabrics |
| `listFabrics` | simulationTools | Browse fabric library |

### Currently in ⌘K: 10 of 16 ✅
### Missing: `listSeamlyPatterns`, `pauseSimulation`, `exportDXF`, `exportPDF`, `saveProject`, `selectPiece`

---

## SHOULD HAVE in ⌘K (38 tools)
*Users do these occasionally and benefit from direct access.*

### Seams & Construction (8)
| Tool | Description |
|------|-------------|
| `setSeamAllowance` | Set SA width (10mm standard) |
| `createSeam` | Connect two edges manually |
| `removeSeam` | Delete seam |
| `autoDetectSeams` | Auto-sew all pieces |
| `setGrainDirection` | Set fabric grain |
| `detectEdges` | Auto-detect semantic edges |
| `classifyPiece` | Auto-classify piece type/side |
| `validatePattern` | Check pattern for issues |

### Grading & Measurements (4)
| Tool | Description |
|------|-------------|
| `gradePiece` | Grade single piece |
| `gradeAllSizes` | Batch grade all pieces |
| `setMeasurements` | Set avatar body measurements |
| `setMeasurementsFromSize` | Populate from size standard |

### Fabric & Material (2)
| Tool | Description |
|------|-------------|
| `assignFabric` | Assign fabric to piece |
| `searchFabrics` | Search fabric library with criteria |

### Colorways (3)
| Tool | Description |
|------|-------------|
| `addColorway` | Create color variant |
| `switchColorway` | Switch active colorway |
| `listColorways` | Browse colorways |

### Trims & Details (3)
| Tool | Description |
|------|-------------|
| `addTrim` | Add button/zipper/snap |
| `removeTrim` | Remove trim |
| `listTrimPresets` | Browse available trim types |

### Artwork (2)
| Tool | Description |
|------|-------------|
| `addArtwork` | Place logo/graphic on piece |
| `removeArtwork` | Remove artwork |

### Layer Management (2)
| Tool | Description |
|------|-------------|
| `setLayer` | Switch to construction layer |
| `toggleXrayMode` | X-ray layer view |

### Visualization & Render (4)
| Tool | Description |
|------|-------------|
| `setRenderResolution` | Set render quality |
| `setGarmentDisplayMode` | Change rendering style |
| `toggleReferenceImages` | Show/hide reference images |
| `setFitMapMode` | Set fit visualization mode |

### Semantic Adjustments (3)
| Tool | Description |
|------|-------------|
| `adjustFit` | Semantic fit adjustment (ease/tightness) |
| `adjustLength` | Semantic length change (hem up/down) |
| `adjustSleeve` | Sleeve-specific adjustment |

### Export & BOM (4)
| Tool | Description |
|------|-------------|
| `exportBOM` | Export Bill of Materials |
| `refreshBOM` | Recalculate BOM |
| `setBOMCurrency` | Set BOM currency |
| `exportBOMCSV` | Export BOM to CSV |

### State & Query (3)
| Tool | Description |
|------|-------------|
| `getEditorState` | Query current editor state |
| `getSelection` | Get current selection |
| `getProjectSummary` | Project overview |

---

## AI-ONLY (178 tools)
*Complex operations where the AI adds value through context understanding.*

### Why AI-only is the right choice for these:

1. **Complex parameters** (80+ tools): Operations like `modifyOutline`, `addConstructionPoint`, `setSeamRange` require precise geometric/mathematical input that the AI resolves from natural language ("make the armhole 2cm wider").

2. **Semantic reasoning** (30+ tools): `adjustProportions`, `analyzeGathering`, `suggestPinPoints` require understanding design intent, not just parameter values.

3. **Orchestration** (20+ tools): `runGarmentPipeline`, `runNesting`, `resolveConstruction` coordinate multiple steps that the AI manages better than a single command.

4. **Analysis** (25+ tools): `analyzePiece`, `compareEase`, `evaluateFormula`, `detectFormulaChanges` produce insights the AI synthesizes into actionable recommendations.

5. **Memory & Context** (11 tools): `rememberDecision`, `recallContext`, `writeDesignNote` are AI-native operations for maintaining design history.

### Examples of why direct access hurts more than helps:

| Tool | Why AI-only |
|------|-------------|
| `modifyDimension` | "Lengthen 3cm" — AI knows which dimension, which piece, which direction |
| `addConstructionPoint` | Requires formula expressions the AI generates |
| `runNesting` | Complex optimization with 10+ parameters the AI configures |
| `suggestPinPoints` | AI analyzes garment geometry to determine optimal pin locations |
| `compareEase` | AI selects relevant comparisons and interprets results |

---

## Recommendations

### Phase 1: Expand ⌘K to 54 commands
Add the 38 SHOULD HAVE commands to the existing 16 MUST HAVE. Group by category in the command palette with section headers.

### Phase 2: Smart contextual surfacing
Show relevant commands based on state:
- Piece selected → show seam, fabric, grading commands
- Simulation running → show pause, reset, fit map commands
- No pieces → show load template, import commands

### Phase 3: Inline tool execution from chat
When the AI uses a tool, show a "Run again" button next to the tool call in chat history. This gives users one-click access to any of the 232 tools after the AI demonstrates it.

---

## Current vs Target

| | Current | Target (Phase 1) |
|---|---|---|
| ⌘K Commands | 25 | 54 |
| AI-accessible | 232 | 232 |
| User-accessible total | 25 | 54 + 232 via chat |
| Coverage | 10.8% | 23.3% direct + 100% via AI |
